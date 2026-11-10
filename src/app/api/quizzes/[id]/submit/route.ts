import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { quizzes, questions, attempts, responses, revisionPlans } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { generateAttemptGapReport } from '@/lib/gap/gap-service';
import { createOrAdaptRevisionPlan } from '@/lib/plan/plan-service';

const submitQuizSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      selectedIndex: z.number().int().min(0).max(3),
    })
  ),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: quizId } = await params;
    const body = await request.json();

    const parsed = submitQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    // Verify quiz ownership
    const [quiz] = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, session.userId)))
      .limit(1);

    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    // Fetch quiz questions with correct index
    const storedQuestions = await db
      .select({
        id: questions.id,
        correctIndex: questions.correctIndex,
      })
      .from(questions)
      .where(eq(questions.quizId, quizId));

    const answerMap = new Map(parsed.data.answers.map((a) => [a.questionId, a.selectedIndex]));

    let correctCount = 0;
    const evaluatedResponses: {
      questionId: string;
      selectedIndex: number;
      isCorrect: boolean;
    }[] = [];

    // Deterministic evaluation: selectedIndex === correctIndex
    for (const q of storedQuestions) {
      const selected = answerMap.get(q.id) ?? -1;
      const isCorrect = selected === q.correctIndex;
      if (isCorrect) correctCount++;

      evaluatedResponses.push({
        questionId: q.id,
        selectedIndex: selected,
        isCorrect,
      });
    }

    // Insert attempt
    const [attempt] = await db
      .insert(attempts)
      .values({
        quizId,
        userId: session.userId,
        subjectId: quiz.subjectId,
        score: correctCount,
        total: storedQuestions.length,
      })
      .returning();

    // Insert responses
    for (const r of evaluatedResponses) {
      await db.insert(responses).values({
        attemptId: attempt.id,
        questionId: r.questionId,
        selectedIndex: r.selectedIndex,
        isCorrect: r.isCorrect,
      });
    }

    // Generate gap report deterministically
    const gapReport = await generateAttemptGapReport(
      attempt.id,
      quiz.subjectId,
      session.userId
    );

    // Adapt Revision Plan if active plan exists (Rule 9: Adaptation)
    let planAdapted = false;
    try {
      const [activePlan] = await db
        .select()
        .from(revisionPlans)
        .where(
          and(
            eq(revisionPlans.subjectId, quiz.subjectId),
            eq(revisionPlans.userId, session.userId),
            eq(revisionPlans.isActive, true)
          )
        )
        .orderBy(desc(revisionPlans.version))
        .limit(1);

      if (activePlan) {
        await createOrAdaptRevisionPlan({
          subjectId: quiz.subjectId,
          userId: session.userId,
          daysAvailable: activePlan.daysAvailable,
          minutesPerDay: activePlan.minutesPerDay,
          basedOnAttemptId: attempt.id,
        });
        planAdapted = true;
      }
    } catch (planErr) {
      console.warn('Failed to auto-adapt revision plan:', planErr);
    }

    return NextResponse.json({
      attemptId: attempt.id,
      score: correctCount,
      total: storedQuestions.length,
      accuracy: Math.round((correctCount / storedQuestions.length) * 100),
      gapReportId: gapReport.reportId,
      planAdapted,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Quiz submission error:', err);
    return NextResponse.json({ error: 'Failed to submit quiz' }, { status: 500 });
  }
}
