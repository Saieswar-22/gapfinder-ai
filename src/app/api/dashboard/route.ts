import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subjects, documents, attempts, gapReportItems, gapReports, revisionPlans, planTasks } from '@/lib/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await requireSession();

    // Counts
    const subjectsCountRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subjects)
      .where(eq(subjects.userId, session.userId));

    const docsCountRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(eq(documents.userId, session.userId));

    const attemptsCountRes = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalScore: sql<number>`COALESCE(sum(${attempts.score}), 0)::int`,
        totalPossible: sql<number>`COALESCE(sum(${attempts.total}), 0)::int`,
      })
      .from(attempts)
      .where(eq(attempts.userId, session.userId));

    const totalSubjects = subjectsCountRes[0]?.count ?? 0;
    const totalDocs = docsCountRes[0]?.count ?? 0;
    const totalAttempts = attemptsCountRes[0]?.count ?? 0;
    const totalScore = attemptsCountRes[0]?.totalScore ?? 0;
    const totalPossible = attemptsCountRes[0]?.totalPossible ?? 0;
    const overallAccuracy = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

    // Classification breakdown from gap items
    const classificationsRes = await db
      .select({
        classification: gapReportItems.classification,
        count: sql<number>`count(*)::int`,
      })
      .from(gapReportItems)
      .innerJoin(gapReports, eq(gapReports.id, gapReportItems.reportId))
      .where(eq(gapReports.userId, session.userId))
      .groupBy(gapReportItems.classification);

    const counts = { weak: 0, medium: 0, strong: 0, insufficient_data: 0 };
    for (const row of classificationsRes) {
      if (row.classification in counts) {
        counts[row.classification as keyof typeof counts] = row.count;
      }
    }

    // Recent subjects
    const recentSubjects = await db
      .select({
        id: subjects.id,
        name: subjects.name,
        createdAt: subjects.createdAt,
      })
      .from(subjects)
      .where(eq(subjects.userId, session.userId))
      .orderBy(desc(subjects.createdAt))
      .limit(5);

    // Recent attempts
    const recentAttempts = await db
      .select({
        id: attempts.id,
        subjectId: attempts.subjectId,
        subjectName: subjects.name,
        score: attempts.score,
        total: attempts.total,
        submittedAt: attempts.submittedAt,
      })
      .from(attempts)
      .innerJoin(subjects, eq(subjects.id, attempts.subjectId))
      .where(eq(attempts.userId, session.userId))
      .orderBy(desc(attempts.submittedAt))
      .limit(5);

    return NextResponse.json({
      totalSubjects,
      totalDocs,
      totalAttempts,
      overallAccuracy,
      classifications: counts,
      recentSubjects,
      recentAttempts,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

