import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quizzes, questions, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: quizId } = await params;

    const [quiz] = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, session.userId)))
      .limit(1);

    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const quizQuestions = await db
      .select({
        id: questions.id,
        topicId: questions.topicId,
        topicName: topics.name,
        question: questions.question,
        options: questions.options,
        citations: questions.citations,
      })
      .from(questions)
      .innerJoin(topics, eq(topics.id, questions.topicId))
      .where(eq(questions.quizId, quizId));

    return NextResponse.json({
      quiz: {
        id: quiz.id,
        subjectId: quiz.subjectId,
        status: quiz.status,
        requestedCount: quiz.requestedCount,
      },
      questions: quizQuestions,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch quiz' }, { status: 500 });
  }
}

