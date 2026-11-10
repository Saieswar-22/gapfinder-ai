import { db } from '@/lib/db';
import {
  quizzes,
  questions,
  topics,
  chunks,
  topicChunks,
  attempts,
  responses,
} from '@/lib/db/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { retrieveChunksForTopic } from '@/lib/rag/retrieval';
import {
  generateMCQsFromContext,
  verifyMCQAnswer,
  type GeneratedQuestion,
} from '@/lib/rag/generation';
import { validateMCQ, isDuplicateStem } from './validation';
import { CONFIG } from '@/lib/config';

export interface GenerateQuizOptions {
  subjectId: string;
  userId: string;
  requestedCount: number;
  topicFilterId?: string;
}

export async function generateQuiz(options: GenerateQuizOptions): Promise<{
  quizId: string;
  questionCount: number;
  warning?: string;
}> {
  const { subjectId, userId, requestedCount, topicFilterId } = options;

  // 1. Fetch available topics for this subject (prefer chapter/topic level)
  let candidateTopics = await db
    .select({
      id: topics.id,
      name: topics.name,
      level: topics.level,
      orderIndex: topics.orderIndex,
    })
    .from(topics)
    .where(
      topicFilterId
        ? and(eq(topics.subjectId, subjectId), eq(topics.id, topicFilterId))
        : and(
            eq(topics.subjectId, subjectId),
            inArray(topics.level, ['chapter', 'topic'])
          )
    )
    .orderBy(topics.orderIndex);

  // If no chapter/topic level exists, take all topics
  if (candidateTopics.length === 0) {
    candidateTopics = await db
      .select({
        id: topics.id,
        name: topics.name,
        level: topics.level,
        orderIndex: topics.orderIndex,
      })
      .from(topics)
      .where(eq(topics.subjectId, subjectId));
  }

  if (candidateTopics.length === 0) {
    throw new Error('No topics found. Please generate the Topic Map before starting a quiz.');
  }

  // 2. Fetch past attempts count per topic to prioritize untested / under-tested topics
  const topicStats = await db
    .select({
      topicId: questions.topicId,
      attemptedCount: sql<number>`count(${responses.id})::int`,
      incorrectCount: sql<number>`count(CASE WHEN ${responses.isCorrect} = false THEN 1 END)::int`,
    })
    .from(questions)
    .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
    .leftJoin(responses, eq(responses.questionId, questions.id))
    .where(and(eq(quizzes.subjectId, subjectId), eq(quizzes.userId, userId)))
    .groupBy(questions.topicId);

  const statsMap = new Map<string, { attempted: number; incorrect: number }>();
  for (const s of topicStats) {
    statsMap.set(s.topicId, { attempted: s.attemptedCount, incorrect: s.incorrectCount });
  }

  // Sort candidate topics: untested first, then weak (high incorrect), then others
  candidateTopics.sort((a, b) => {
    const statA = statsMap.get(a.id) || { attempted: 0, incorrect: 0 };
    const statB = statsMap.get(b.id) || { attempted: 0, incorrect: 0 };

    if (statA.attempted === 0 && statB.attempted > 0) return -1;
    if (statB.attempted === 0 && statA.attempted > 0) return 1;

    // Highest incorrect first
    return statB.incorrect - statA.incorrect;
  });

  // 3. Backend logic rule 19A: Each targeted topic receives at least 2 questions
  // Determine how many topics to pick based on requested count
  const minPerTopic = CONFIG.MIN_QUESTIONS_PER_TOPIC; // 2
  const maxTopicsToPick = Math.max(1, Math.floor(requestedCount / minPerTopic));
  const selectedTopics = candidateTopics.slice(0, maxTopicsToPick);

  // Distribute counts so sum == requestedCount and each has >= 2
  const topicTargets: { topic: typeof selectedTopics[0]; count: number }[] = [];
  const baseCount = Math.floor(requestedCount / selectedTopics.length);
  let remainder = requestedCount % selectedTopics.length;

  for (const t of selectedTopics) {
    const c = baseCount + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    topicTargets.push({ topic: t, count: Math.max(minPerTopic, c) });
  }

  // 4. Fetch stored questions to prevent stem duplication (Rule 19D)
  const existingQuestions = await db
    .select({ question: questions.question })
    .from(questions)
    .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
    .where(and(eq(quizzes.subjectId, subjectId), eq(quizzes.userId, userId)));

  const existingStems = existingQuestions.map((q) => q.question);

  // 5. Create quiz record
  const [quiz] = await db
    .insert(quizzes)
    .values({
      subjectId,
      userId,
      requestedCount,
      status: 'generating',
    })
    .returning();

  // 6. Generate MCQs per target topic
  const createdQuestions: any[] = [];

  for (const target of topicTargets) {
    try {
      const topicChunksResult = await retrieveChunksForTopic(
        subjectId,
        userId,
        target.topic.name,
        undefined,
        6
      );

      if (topicChunksResult.length === 0) continue;

      const generated = await generateMCQsFromContext(
        topicChunksResult,
        target.topic.name,
        target.count,
        existingStems
      );

      const contextText = topicChunksResult.map((c) => c.text).join(' ');

      for (const mcq of generated) {
        // Validate question quality gates
        const val = validateMCQ({
          question: mcq.question,
          options: mcq.options,
          correctIndex: mcq.correctIndex,
          explanation: mcq.explanation,
          supportingQuote: mcq.supportingQuote,
          citations: mcq.citations,
          context: contextText,
        });

        if (!val.valid) {
          console.warn(`MCQ rejected by validator: ${val.error}`);
          continue;
        }

        // Check stem deduplication
        if (isDuplicateStem(mcq.question, existingStems)) {
          console.warn(`MCQ rejected: duplicate stem: "${mcq.question}"`);
          continue;
        }

        // Run secondary verification solver (Rule 19C)
        const verification = await verifyMCQAnswer(mcq.question, mcq.options, contextText);
        if (verification !== null && verification !== mcq.correctIndex) {
          console.warn(
            `MCQ rejected: verification predicted index ${verification} vs generated ${mcq.correctIndex}`
          );
          continue;
        }

        // Insert question
        const [savedQ] = await db
          .insert(questions)
          .values({
            quizId: quiz.id,
            topicId: target.topic.id,
            subtopicId: null,
            question: mcq.question,
            options: mcq.options,
            correctIndex: mcq.correctIndex,
            explanation: mcq.explanation,
            wrongOptionNotes: mcq.wrongOptionNotes,
            sourceChunkIds: mcq.sourceChunkIds,
            citations: mcq.citations,
            supportingQuote: mcq.supportingQuote,
          })
          .returning();

        createdQuestions.push(savedQ);
        existingStems.push(mcq.question);
      }
    } catch (err) {
      console.error(`Failed to generate questions for topic ${target.topic.name}:`, err);
    }
  }

  // Update quiz status
  await db
    .update(quizzes)
    .set({ status: 'ready' })
    .where(eq(quizzes.id, quiz.id));

  let warning: string | undefined;
  if (createdQuestions.length < requestedCount) {
    warning = `Generated ${createdQuestions.length} grounded questions (fewer than ${requestedCount} requested) due to available context constraints and strict verification quality gates.`;
  }

  return {
    quizId: quiz.id,
    questionCount: createdQuestions.length,
    warning,
  };
}
