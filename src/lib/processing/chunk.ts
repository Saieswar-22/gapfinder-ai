import { CONFIG } from '@/lib/config';

export interface ChunkData {
  text: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  tokenEstimate: number;
}

export function estimateTokens(text: string): number {
  // Safe estimate for English: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Split per-page text into chunks of ~500-800 tokens with ~80 token overlap.
 * Splits on paragraph boundaries without crossing documents.
 * Tracks pageStart and pageEnd accurately.
 */
export function chunkPages(pages: string[]): ChunkData[] {
  const { CHUNK_SIZE_TOKENS, CHUNK_OVERLAP_TOKENS, MIN_CHUNK_TOKENS } = CONFIG;

  interface Paragraph {
    text: string;
    page: number;
    tokens: number;
  }

  const paragraphs: Paragraph[] = [];
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageText = pages[pageIdx];
    if (!pageText || !pageText.trim()) continue;

    const parts = pageText.split(/\n{2,}/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      paragraphs.push({
        text: trimmed,
        page: pageIdx + 1,
        tokens: estimateTokens(trimmed),
      });
    }
  }

  if (paragraphs.length === 0) return [];

  const chunks: ChunkData[] = [];
  let currentParagraphs: Paragraph[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // If adding this paragraph exceeds the target size, finalize current chunk
    if (currentTokens + para.tokens > CHUNK_SIZE_TOKENS && currentParagraphs.length > 0) {
      const text = currentParagraphs.map((p) => p.text).join('\n\n');
      chunks.push({
        text,
        pageStart: currentParagraphs[0].page,
        pageEnd: currentParagraphs[currentParagraphs.length - 1].page,
        chunkIndex,
        tokenEstimate: estimateTokens(text),
      });
      chunkIndex++;

      // Retain ~80 tokens for overlap
      let overlapTokens = 0;
      const overlapParas: Paragraph[] = [];
      for (let j = currentParagraphs.length - 1; j >= 0; j--) {
        if (overlapTokens + currentParagraphs[j].tokens > CHUNK_OVERLAP_TOKENS && overlapParas.length > 0) {
          break;
        }
        overlapParas.unshift(currentParagraphs[j]);
        overlapTokens += currentParagraphs[j].tokens;
      }

      currentParagraphs = overlapParas;
      currentTokens = overlapTokens;
    }

    currentParagraphs.push(para);
    currentTokens += para.tokens;
  }

  // Handle remaining paragraphs
  if (currentParagraphs.length > 0) {
    const text = currentParagraphs.map((p) => p.text).join('\n\n');
    if (currentTokens < MIN_CHUNK_TOKENS && chunks.length > 0) {
      // Append small remainder to last chunk
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.text = `${lastChunk.text}\n\n${text}`;
      lastChunk.pageEnd = currentParagraphs[currentParagraphs.length - 1].page;
      lastChunk.tokenEstimate = estimateTokens(lastChunk.text);
    } else {
      chunks.push({
        text,
        pageStart: currentParagraphs[0].page,
        pageEnd: currentParagraphs[currentParagraphs.length - 1].page,
        chunkIndex,
        tokenEstimate: estimateTokens(text),
      });
    }
  }

  return chunks;
}

