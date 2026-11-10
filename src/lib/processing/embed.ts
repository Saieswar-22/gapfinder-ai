import { db } from '@/lib/db';
import { chunks, documents } from '@/lib/db/schema';
import { eq, isNull, and, sql } from 'drizzle-orm';
import { embedTexts } from '@/lib/ai/embeddings';
import { CONFIG } from '@/lib/config';

export interface BatchEmbedResult {
  processed: number;
  remaining: number;
  total: number;
  done: boolean;
}

/**
 * Process a batch of unembedded chunks for a document (resumable processing).
 */
export async function embedDocumentBatch(
  documentId: string,
  batchSize: number = CONFIG.EMBEDDING_BATCH_SIZE
): Promise<BatchEmbedResult> {
  // Count total chunks for this document
  const totalRes = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(eq(chunks.documentId, documentId));
  const total = totalRes[0]?.count ?? 0;

  // Get next batch of unembedded chunks
  const pendingChunks = await db
    .select({ id: chunks.id, text: chunks.text })
    .from(chunks)
    .where(and(eq(chunks.documentId, documentId), isNull(chunks.embedding)))
    .limit(batchSize);

  if (pendingChunks.length === 0) {
    // All done
    await db
      .update(documents)
      .set({ status: 'ready', errorMessage: null })
      .where(eq(documents.id, documentId));

    return { processed: 0, remaining: 0, total, done: true };
  }

  // Generate embeddings for the batch
  const texts = pendingChunks.map((c) => c.text);
  const embeddings = await embedTexts(texts);

  // Update chunks in DB
  for (let i = 0; i < pendingChunks.length; i++) {
    const vectorLiteral = `[${embeddings[i].join(',')}]`;
    await db.execute(
      sql`UPDATE chunks SET embedding = ${vectorLiteral}::vector WHERE id = ${pendingChunks[i].id}`
    );
  }

  // Count remaining unembedded
  const remainingRes = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(and(eq(chunks.documentId, documentId), isNull(chunks.embedding)));
  const remaining = remainingRes[0]?.count ?? 0;

  const done = remaining === 0;
  if (done) {
    await db
      .update(documents)
      .set({ status: 'ready', errorMessage: null })
      .where(eq(documents.id, documentId));
  }

  return {
    processed: pendingChunks.length,
    remaining,
    total,
    done,
  };
}

