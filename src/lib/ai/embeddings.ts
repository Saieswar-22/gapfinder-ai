import { embedMany, embed } from 'ai';
import { getEmbeddingModel } from './providers';

/**
 * Embed a single text for retrieval queries.
 * Task type 'retrieval_query' if supported, using pinned dimension 768.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const model = getEmbeddingModel();
  const result = await embed({
    model,
    value: text,
  });
  return result.embedding;
}

/**
 * Embed multiple document chunks with batching and retry on 429.
 */
export async function embedTexts(texts: string[], maxRetries = 3): Promise<number[][]> {
  const model = getEmbeddingModel();
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await embedMany({
        model,
        values: texts,
      });
      return result.embeddings;
    } catch (error: any) {
      if (error?.status === 429 && attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Embedding rate limited, waiting ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Embedding failed after retries');
}
