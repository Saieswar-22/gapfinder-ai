import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { gapReports, gapReportItems, topics, subjects, attempts } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { getCumulativeGapReport } from '@/lib/gap/gap-service';

export async function GET(
  request: NextRequest,
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

    const { searchParams } = new URL(request.url);
    const attemptId = searchParams.get('attemptId');

    // List of past saved reports for this subject
    const pastReports = await db
      .select({
        id: gapReports.id,
        attemptId: gapReports.attemptId,
        createdAt: gapReports.createdAt,
        score: attempts.score,
        total: attempts.total,
      })
      .from(gapReports)
      .leftJoin(attempts, eq(attempts.id, gapReports.attemptId))
      .where(and(eq(gapReports.subjectId, subjectId), eq(gapReports.userId, session.userId)))
      .orderBy(desc(gapReports.createdAt));

    if (attemptId) {
      // Find specific report
      const [report] = await db
        .select()
        .from(gapReports)
        .where(and(eq(gapReports.attemptId, attemptId), eq(gapReports.userId, session.userId)))
        .limit(1);

      if (!report) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }

      const items = await db
        .select({
          topicId: gapReportItems.topicId,
          topicName: topics.name,
          attempted: gapReportItems.attempted,
          correct: gapReportItems.correct,
          incorrect: gapReportItems.incorrect,
          accuracy: gapReportItems.accuracy,
          classification: gapReportItems.classification,
          reason: gapReportItems.reason,
        })
        .from(gapReportItems)
        .innerJoin(topics, eq(topics.id, gapReportItems.topicId))
        .where(eq(gapReportItems.reportId, report.id));

      const summary = {
        weak: 0,
        medium: 0,
        strong: 0,
        insufficient_data: 0,
        totalAttempted: 0,
        overallAccuracy: 0,
      };

      let totalCorrect = 0;
      for (const item of items) {
        if (item.classification in summary) {
          summary[item.classification as keyof typeof summary]++;
        }
        summary.totalAttempted += item.attempted;
        totalCorrect += item.correct;
      }
      summary.overallAccuracy =
        summary.totalAttempted > 0 ? Math.round((totalCorrect / summary.totalAttempted) * 100) : 0;

      return NextResponse.json({
        reportType: 'attempt',
        reportId: report.id,
        attemptId: report.attemptId,
        items,
        summary,
        pastReports,
      });
    }

    // Default: Cumulative view
    const cumulative = await getCumulativeGapReport(subjectId, session.userId);

    return NextResponse.json({
      reportType: 'cumulative',
      items: cumulative.items,
      summary: cumulative.summary,
      pastReports,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch gap report' }, { status: 500 });
  }
}

