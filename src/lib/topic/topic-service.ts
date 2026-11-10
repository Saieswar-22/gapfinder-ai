import { db } from '@/lib/db';
import {
  topics,
  topicChunks,
  chunks,
  documents,
  pastPaperQuestions,
} from '@/lib/db/schema';
import { eq, and, sql, asc } from 'drizzle-orm';
import { extractTopicsFromContext, isQuoteGrounded } from '@/lib/rag/generation';
import { retrieveChunks, type RetrievedChunk } from '@/lib/rag/retrieval';
import { embedQuery } from '@/lib/ai/embeddings';
import { CONFIG } from '@/lib/config';

export interface BuildTopicMapResult {
  success: boolean;
  chapterCount: number;
  topicCount: number;
  subtopicCount: number;
  isLowerConfidence: boolean;
  message?: string;
}

/**
 * Builds the syllabus-derived topic map for a subject.
 */
export async function buildTopicMap(
  subjectId: string,
  userId: string
): Promise<BuildTopicMapResult> {
  // 1. Find syllabus document chunks
  let syllabusChunks = await db
    .select({
      id: chunks.id,
      documentId: chunks.documentId,
      documentName: documents.filename,
      pageStart: chunks.pageStart,
      pageEnd: chunks.pageEnd,
      text: chunks.text,
      chunkIndex: chunks.chunkIndex,
    })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(
      and(
        eq(chunks.subjectId, subjectId),
        eq(chunks.userId, userId),
        eq(documents.docType, 'syllabus')
      )
    )
    .orderBy(asc(chunks.chunkIndex));

  let isLowerConfidence = false;

  // Fallback: If no syllabus document, use any other uploaded document (lower confidence)
  if (syllabusChunks.length === 0) {
    syllabusChunks = await db
      .select({
        id: chunks.id,
        documentId: chunks.documentId,
        documentName: documents.filename,
        pageStart: chunks.pageStart,
        pageEnd: chunks.pageEnd,
        text: chunks.text,
        chunkIndex: chunks.chunkIndex,
      })
      .from(chunks)
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(and(eq(chunks.subjectId, subjectId), eq(chunks.userId, userId)))
      .orderBy(asc(chunks.chunkIndex))
      .limit(20);

    isLowerConfidence = true;
  }

  if (syllabusChunks.length === 0) {
    return {
      success: false,
      chapterCount: 0,
      topicCount: 0,
      subtopicCount: 0,
      isLowerConfidence: false,
      message: 'No study materials found. Please upload a syllabus or study notes first.',
    };
  }

  const retrievedChunks: RetrievedChunk[] = syllabusChunks.map((c) => ({
    ...c,
    score: 1.0,
  }));

  // Step 1: Extract topics via LLM
  const extractionResult = await extractTopicsFromContext(retrievedChunks);
  if (!extractionResult || extractionResult.topics.length === 0) {
    return {
      success: false,
      chapterCount: 0,
      topicCount: 0,
      subtopicCount: 0,
      isLowerConfidence,
      message: 'Could not extract structured topics from the material.',
    };
  }

  // Clear existing topics for this subject to prevent stale tree
  await db.delete(topics).where(eq(topics.subjectId, subjectId));

  const fullSyllabusText = syllabusChunks.map((c) => c.text).join(' ');
  const sourceDocId = syllabusChunks[0].documentId;

  let chapterCount = 0;
  let topicCount = 0;
  let subtopicCount = 0;
  let orderIndex = 0;

  // Step 1 validation: Verify quotes and save hierarchy
  for (const chapter of extractionResult.topics) {
    // Validate quote exists in text
    if (!isQuoteGrounded(chapter.source_quote, fullSyllabusText)) {
      continue;
    }

    const [savedChapter] = await db
      .insert(topics)
      .values({
        subjectId,
        parentId: null,
        level: 'chapter',
        name: chapter.name.trim(),
        orderIndex: orderIndex++,
        sourceDocumentId: sourceDocId,
        sourcePage: chapter.source_page || 1,
        sourceQuote: chapter.source_quote,
      })
      .returning();
    chapterCount++;

    if (chapter.children && chapter.children.length > 0) {
      for (const topic of chapter.children) {
        if (!isQuoteGrounded(topic.source_quote, fullSyllabusText)) {
          continue;
        }

        const [savedTopic] = await db
          .insert(topics)
          .values({
            subjectId,
            parentId: savedChapter.id,
            level: 'topic',
            name: topic.name.trim(),
            orderIndex: orderIndex++,
            sourceDocumentId: sourceDocId,
            sourcePage: topic.source_page || 1,
            sourceQuote: topic.source_quote,
          })
          .returning();
        topicCount++;

        if (topic.children && topic.children.length > 0) {
          for (const subtopic of topic.children) {
            if (!isQuoteGrounded(subtopic.source_quote, fullSyllabusText)) {
              continue;
            }

            await db.insert(topics).values({
              subjectId,
              parentId: savedTopic.id,
              level: 'subtopic',
              name: subtopic.name.trim(),
              orderIndex: orderIndex++,
              sourceDocumentId: sourceDocId,
              sourcePage: subtopic.source_page || 1,
              sourceQuote: subtopic.source_quote,
            });
            subtopicCount++;
          }
        }
      }
    }
  }

  // Step 2: Retrieval-based mapping to non-syllabus documents
  const allSavedTopics = await db
    .select()
    .from(topics)
    .where(eq(topics.subjectId, subjectId));

  for (const t of allSavedTopics) {
    try {
      const matchedChunks = await retrieveChunks({
        subjectId,
        userId,
        query: t.name,
        topK: 3,
        similarityThreshold: 0.65,
      });

      for (const mc of matchedChunks) {
        await db
          .insert(topicChunks)
          .values({
            topicId: t.id,
            chunkId: mc.id,
            score: mc.score,
          })
          .onConflictDoNothing();
      }
    } catch (mapErr) {
      console.warn(`Mapping failed for topic ${t.name}:`, mapErr);
    }
  }

  return {
    success: true,
    chapterCount,
    topicCount,
    subtopicCount,
    isLowerConfidence,
  };
}

