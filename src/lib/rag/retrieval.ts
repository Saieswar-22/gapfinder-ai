import { db } from '@/lib/db';
import { chunks, documents } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { embedQuery } from '@/lib/ai/embeddings';
import { CONFIG } from '@/lib/config';

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentName: string;
  pageStart: number;
  pageEnd: number;
  text: string;
  score: number;
  chunkIndex: number;
}

export interface RetrievalOptions {
  subjectId: string;
  userId: string;
  query: string;
  topK?: number;
  similarityThreshold?: number;
  documentFilter?: string;
  docTypeFilter?: string;
}

/**
 * Pure retrieval module — NO LLM generation here.
 * Exact cosine distance search filtered by subject_id and user_id using btree index on subject_id.
 */
export async function retrieveChunks(options: RetrievalOptions): Promise<RetrievedChunk[]> {
  const {
    subjectId,
    userId,
    query,
    topK = CONFIG.RETRIEVAL_TOP_K,
    similarityThreshold = CONFIG.SIMILARITY_THRESHOLD,
    documentFilter,
    docTypeFilter,
  } = options;

  // Clean / normalize query
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) {
    return [];
  }

  // Embed query
  const queryVec = await embedQuery(normalizedQuery);
  const vectorLiteral = `[${queryVec.join(',')}]`;

  // Exact cosine search filtered by subject_id and user_id
  const results = await db.execute(sql`
    SELECT
      c.id,
      c.document_id,
      c.page_start,
      c.page_end,
      c.text,
      c.chunk_index,
      d.filename AS document_name,
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.subject_id = ${subjectId}
      AND c.user_id = ${userId}
      AND c.embedding IS NOT NULL
      ${documentFilter ? sql`AND c.document_id = ${documentFilter}` : sql``}
      ${docTypeFilter ? sql`AND d.doc_type = ${docTypeFilter}` : sql``}
    ORDER BY c.embedding <=> ${vectorLiteral}::vector ASC
    LIMIT ${topK}
  `);

  const rows = (results as any).rows || results;
  const list = Array.isArray(rows) ? rows : [];

  return list
    .filter((row: any) => parseFloat(row.similarity) >= similarityThreshold)
    .map((row: any) => ({
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      pageStart: row.page_start,
      pageEnd: row.page_end,
      text: row.text,
      score: parseFloat(row.similarity),
      chunkIndex: row.chunk_index,
    }));
}

/**
 * Retrieve chunks for a topic by expanding query with parent topic context.
 */
export async function retrieveChunksForTopic(
  subjectId: string,
  userId: string,
  topicName: string,
  parentTopicName?: string,
  topK?: number
): Promise<RetrievedChunk[]> {
  const query = parentTopicName ? `${parentTopicName}: ${topicName}` : topicName;
  return retrieveChunks({
    subjectId,
    userId,
    query,
    topK: topK || CONFIG.RETRIEVAL_TOP_K,
  });
}

