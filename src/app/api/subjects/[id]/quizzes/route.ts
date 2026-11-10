import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { quizzes, attempts, subjects } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { generateQuiz } from '@/lib/quiz/quiz-generator';

export const maxDuration = 60;

const createQuizSchema = z.object({
  requestedCount: z.number().int().min(5).max(30).default(10),
  topicFilterId: z.string().uuid().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;

    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const pastAttempts = await db
      .select({
        id: attempts.id,
        quizId: attempts.quizId,
        score: attempts.score,
        total: attempts.total,
        submittedAt: attempts.submittedAt,
      })
      .from(attempts)
      .where(and(eq(attempts.subjectId, subjectId), eq(attempts.userId, session.userId)))
      .orderBy(desc(attempts.submittedAt));

    return NextResponse.json({ attempts: pastAttempts });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch quizzes' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;
    const body = await request.json();

    const parsed = createQuizSchema.safeParse(body);
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

    const result = await generateQuiz({
      subjectId,
      userId: session.userId,
      requestedCount: parsed.data.requestedCount,
      topicFilterId: parsed.data.topicFilterId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Quiz generation error:', err);
    return NextResponse.json(
      { error: err.message || 'Quiz generation failed' },
      { status: 500 }
    );
  }
}
