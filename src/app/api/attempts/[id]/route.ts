import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attempts, responses, questions, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: attemptId } = await params;

    const [attempt] = await db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.userId)))
      .limit(1);

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    const reviewItems = await db
      .select({
        responseId: responses.id,
        selectedIndex: responses.selectedIndex,
        isCorrect: responses.isCorrect,
        question: questions.question,
        options: questions.options,
        correctIndex: questions.correctIndex,
        explanation: questions.explanation,
        wrongOptionNotes: questions.wrongOptionNotes,
        citations: questions.citations,
        supportingQuote: questions.supportingQuote,
        topicName: topics.name,
      })
      .from(responses)
      .innerJoin(questions, eq(questions.id, responses.questionId))
      .innerJoin(topics, eq(topics.id, questions.topicId))
      .where(eq(responses.attemptId, attemptId));

    return NextResponse.json({
      attempt,
      questions: reviewItems,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch attempt details' }, { status: 500 });
  }
}
