import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  attempts,
  responses,
  questions,
  topics,
  subjects,
  revisionPlans,
  planTasks,
  documents,
} from '@/lib/db/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { getCumulativeGapReport } from '@/lib/gap/gap-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;

    const [subject] = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    // 1. Fetch all attempts in chronological order
    const attemptRows = await db
      .select({
        id: attempts.id,
        score: attempts.score,
        total: attempts.total,
        submittedAt: attempts.submittedAt,
      })
      .from(attempts)
      .where(and(eq(attempts.subjectId, subjectId), eq(attempts.userId, session.userId)))
      .orderBy(asc(attempts.submittedAt));

    const totalAttempts = attemptRows.length;
    const totalScore = attemptRows.reduce((s, a) => s + a.score, 0);
    const totalPossible = attemptRows.reduce((s, a) => s + a.total, 0);
    const overallAccuracy = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

    // Line chart data: score over attempts
    const scoreOverAttempts = attemptRows.map((a, idx) => ({
      attempt: `#${idx + 1}`,
      date: new Date(a.submittedAt).toLocaleDateString(),
      accuracy: a.total > 0 ? Math.round((a.score / a.total) * 100) : 0,
      score: a.score,
      total: a.total,
    }));

    // 2. Cumulative gap report (weak/medium/strong counts and topic-wise accuracy)
    const cumulative = await getCumulativeGapReport(subjectId, session.userId);

    // Bar chart data: topic-wise accuracy
    const topicAccuracy = cumulative.items
      .filter((item) => item.attempted > 0)
      .map((item) => ({
        topic: item.topicName.length > 15 ? `${item.topicName.slice(0, 15)}...` : item.topicName,
        accuracy: Math.round(item.accuracy * 100),
      }));

    // 3. Per-topic improvement between first and latest attempts
    const topicImprovement: {
      topic: string;
      firstAccuracy: number;
      latestAccuracy: number;
      change: number;
    }[] = [];

    if (attemptRows.length >= 2) {
      const firstAttemptId = attemptRows[0].id;
      const latestAttemptId = attemptRows[attemptRows.length - 1].id;

      const responsesFirst = await db
        .select({
          topicName: topics.name,
          isCorrect: responses.isCorrect,
        })
        .from(responses)
        .innerJoin(questions, eq(questions.id, responses.questionId))
        .innerJoin(topics, eq(topics.id, questions.topicId))
        .where(eq(responses.attemptId, firstAttemptId));

      const responsesLatest = await db
        .select({
          topicName: topics.name,
          isCorrect: responses.isCorrect,
        })
        .from(responses)
        .innerJoin(questions, eq(questions.id, responses.questionId))
        .innerJoin(topics, eq(topics.id, questions.topicId))
        .where(eq(responses.attemptId, latestAttemptId));

      // Calculate accuracies
      const calcAcc = (rows: typeof responsesFirst) => {
        const m = new Map<string, { total: number; correct: number }>();
        for (const r of rows) {
          const c = m.get(r.topicName) || { total: 0, correct: 0 };
          c.total++;
          if (r.isCorrect) c.correct++;
          m.set(r.topicName, c);
        }
        return m;
      };

      const mFirst = calcAcc(responsesFirst);
      const mLatest = calcAcc(responsesLatest);

      // Compare overlapping topics
      for (const [topicName, latestStats] of mLatest.entries()) {
        const firstStats = mFirst.get(topicName);
        if (firstStats) {
          const firstPct = Math.round((firstStats.correct / firstStats.total) * 100);
          const latestPct = Math.round((latestStats.correct / latestStats.total) * 100);
          topicImprovement.push({
            topic: topicName,
            firstAccuracy: firstPct,
            latestAccuracy: latestPct,
            change: latestPct - firstPct,
          });
        }
      }
    }

    // 4. Active revision plan progress
    const [activePlan] = await db
      .select()
      .from(revisionPlans)
      .where(
        and(
          eq(revisionPlans.subjectId, subjectId),
          eq(revisionPlans.userId, session.userId),
          eq(revisionPlans.isActive, true)
        )
      )
      .orderBy(desc(revisionPlans.version))
      .limit(1);

    let planProgress = null;
    if (activePlan) {
      const tasks = await db
        .select({ completed: planTasks.completed })
        .from(planTasks)
        .where(eq(planTasks.planId, activePlan.id));

      const completed = tasks.filter((t) => t.completed).length;
      planProgress = {
        version: activePlan.version,
        completedTasks: completed,
        totalTasks: tasks.length,
        percentage: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
      };
    }

    return NextResponse.json({
      totalAttempts,
      overallAccuracy,
      classifications: cumulative.summary,
      topicAccuracy,
      scoreOverAttempts,
      topicImprovement,
      planProgress,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Progress calculation error:', err);
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
  }
}

