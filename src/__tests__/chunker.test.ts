import { describe, it, expect } from 'vitest';
import { chunkPages, estimateTokens } from '@/lib/processing/chunk';
import { cleanPages, cleanText } from '@/lib/processing/clean';

describe('Chunker & Cleaner Tests', () => {
  it('cleanText normalizes spaces and hyphenated line breaks', () => {
    const raw = 'This is an examp-\nle of text    with   extra spaces.\n\n\nPage 1\n\nNext line.';
    const cleaned = cleanText(raw);
    expect(cleaned).toContain('example');
    expect(cleaned).not.toContain('Page 1');
    expect(cleaned).toContain('extra spaces');
  });

  it('chunkPages tracks pageStart and pageEnd correctly across multiple pages', () => {
    const page1 = 'First page paragraph one.\n\nFirst page paragraph two.';
    const page2 = 'Second page content with information about algebra.\n\nMore algebra notes.';
    const page3 = 'Third page conclusion and summaries.';

    const chunks = chunkPages([page1, page2, page3]);
    expect(chunks.length).toBeGreaterThan(0);

    // Verify first chunk starts at page 1
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[chunks.length - 1].pageEnd).toBe(3);

    // Check each chunk properties
    chunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx);
      expect(chunk.pageStart).toBeGreaterThanOrEqual(1);
      expect(chunk.pageEnd).toBeGreaterThanOrEqual(chunk.pageStart);
      expect(chunk.tokenEstimate).toBeGreaterThan(0);
      expect(chunk.text.length).toBeGreaterThan(0);
    });
  });

  it('handles empty or blank pages without crashing', () => {
    const chunks = chunkPages(['', '   ', '\n\n']);
    expect(chunks).toEqual([]);
  });
});

