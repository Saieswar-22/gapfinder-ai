import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { subjects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { retrieveChunks } from '@/lib/rag/retrieval';
import { createAssistantStream } from '@/lib/rag/generation';

export const maxDuration = 60;

const assistantSchema = z.object({
  question: z.string().min(1, 'Question is required').max(2000),
  topicName: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;
    const body = await request.json();

    const parsed = assistantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    // Verify ownership
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const { question, topicName, history } = parsed.data;

    // Build retrieval query
    const searchQuery = topicName ? `${topicName}: ${question}` : question;

    // Retrieve grounded chunks
    const retrieved = await retrieveChunks({
      subjectId,
      userId: session.userId,
      query: searchQuery,
      topK: 6,
      similarityThreshold: 0.65,
    });

    // Generate response stream
    const { textStream, citations, isInsufficient } = createAssistantStream(
      retrieved,
      question,
      history
    );

    // Stream text back with citations encoded in header
    const citationsHeader = encodeURIComponent(JSON.stringify(citations));

    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        }
      },
    });

    return new Response(customReadable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Citations': citationsHeader,
        'X-Insufficient': isInsufficient ? 'true' : 'false',
      },
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Assistant error:', err);
    return NextResponse.json(
      { error: err.message || 'Assistant request failed' },
      { status: 500 }
    );
  }
}
