import { db } from '@/lib/db';
import {
  gapReports,
  gapReportItems,
  attempts,
  responses,
  questions,
  topics,
} from '@/lib/db/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import {
  classifyTopicStats,
  computeCumulativeClassification,
  type TopicAttemptStats,
} from './classifier';

export interface GapReportResult {
  reportId: string;
  attemptId: string | null;
  items: TopicAttemptStats[];
  summary: {
    weak: number;
    medium: number;
    strong: number;
    insufficient_data: number;
    totalAttempted: number;
    overallAccuracy: number;
  };
}

/**
 * Computes deterministic gap report for a specific attempt and saves it.
 */
export async function generateAttemptGapReport(
  attemptId: string,
  subjectId: string,
  userId: string
): Promise<GapReportResult> {
  // Fetch attempt responses joined with questions and topics
  const responseRows = await db
    .select({
      topicId: questions.topicId,
      subtopicId: questions.subtopicId,
      topicName: topics.name,
      parentId: topics.parentId,
      isCorrect: responses.isCorrect,
    })
    .from(responses)
    .innerJoin(questions, eq(questions.id, responses.questionId))
    .innerJoin(topics, eq(topics.id, questions.topicId))
    .where(eq(responses.attemptId, attemptId));

  // Roll up into topic level (Rule 19A: roll subtopic results up into parent topic)
  const topicMap = new Map<string, { topicName: string; attempted: number; correct: number; parentId: string | null }>();

  for (const r of responseRows) {
    const existing = topicMap.get(r.topicId) || {
      topicName: r.topicName,
      attempted: 0,
      correct: 0,
      parentId: r.parentId,
    };

    existing.attempted++;
    if (r.isCorrect) existing.correct++;
    topicMap.set(r.topicId, existing);
  }

  // Create gap report entry
  const [report] = await db
    .insert(gapReports)
    .values({
      attemptId,
      subjectId,
      userId,
    })
    .returning();

  const items: TopicAttemptStats[] = [];
  const summary = {
    weak: 0,
    medium: 0,
    strong: 0,
    insufficient_data: 0,
    totalAttempted: 0,
    overallAccuracy: 0,
  };

  let totalCorrect = 0;

  for (const [topicId, data] of topicMap.entries()) {
    const stat = classifyTopicStats(
      topicId,
      data.topicName,
      data.attempted,
      data.correct,
      data.parentId
    );

    items.push(stat);
    summary[stat.classification]++;
    summary.totalAttempted += data.attempted;
    totalCorrect += data.correct;

    // Save item
    await db.insert(gapReportItems).values({
      reportId: report.id,
      topicId,
      attempted: stat.attempted,
      correct: stat.correct,
      incorrect: stat.incorrect,
      accuracy: stat.accuracy,
      classification: stat.classification,
      reason: stat.reason,
    });
  }

  summary.overallAccuracy =
    summary.totalAttempted > 0 ? Math.round((totalCorrect / summary.totalAttempted) * 100) : 0;

  return {
    reportId: report.id,
    attemptId,
    items,
    summary,
  };
}

/**
 * Computes cumulative gap analysis across all historical attempts for a subject.
 */
export async function getCumulativeGapReport(
  subjectId: string,
  userId: string
): Promise<{
  items: TopicAttemptStats[];
  summary: {
    weak: number;
    medium: number;
    strong: number;
    insufficient_data: number;
    totalAttempted: number;
    overallAccuracy: number;
  };
}> {
  // Fetch all topics in subject
  const allTopics = await db
    .select({
      id: topics.id,
      name: topics.name,
      parentId: topics.parentId,
      level: topics.level,
      orderIndex: topics.orderIndex,
    })
    .from(topics)
    .where(eq(topics.subjectId, subjectId))
    .orderBy(topics.orderIndex);

  // Fetch all user responses for this subject ordered by attempt submission
  const history = await db
    .select({
      topicId: questions.topicId,
      attemptId: attempts.id,
      submittedAt: attempts.submittedAt,
      isCorrect: responses.isCorrect,
    })
    .from(responses)
    .innerJoin(attempts, eq(attempts.id, responses.attemptId))
    .innerJoin(questions, eq(questions.id, responses.questionId))
    .where(and(eq(attempts.subjectId, subjectId), eq(attempts.userId, userId)))
    .orderBy(attempts.submittedAt);

  // Group by topicId -> attemptId -> { attempted, correct }
  const topicAttemptMap = new Map<string, Map<string, { attempted: number; correct: number }>>();

  for (const h of history) {
    let attemptMap = topicAttemptMap.get(h.topicId);
    if (!attemptMap) {
      attemptMap = new Map();
      topicAttemptMap.set(h.topicId, attemptMap);
    }

    const cur = attemptMap.get(h.attemptId) || { attempted: 0, correct: 0 };
    cur.attempted++;
    if (h.isCorrect) cur.correct++;
    attemptMap.set(h.attemptId, cur);
  }

  const items: TopicAttemptStats[] = [];
  const summary = {
    weak: 0,
    medium: 0,
    strong: 0,
    insufficient_data: 0,
    totalAttempted: 0,
    overallAccuracy: 0,
  };

  let totalCorrect = 0;

  for (const t of allTopics) {
    const attemptMap = topicAttemptMap.get(t.id);
    const historicalAttempts = attemptMap ? Array.from(attemptMap.values()) : [];

    const stats = computeCumulativeClassification(t.id, t.name, historicalAttempts);
    items.push(stats);
    summary[stats.classification]++;
    summary.totalAttempted += stats.attempted;
    totalCorrect += stats.correct;
  }

  summary.overallAccuracy =
    summary.totalAttempted > 0 ? Math.round((totalCorrect / summary.totalAttempted) * 100) : 0;

  return { items, summary };
}

