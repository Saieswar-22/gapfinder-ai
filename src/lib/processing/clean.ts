/**
 * Clean extracted text: normalize whitespace, strip repeated headers/footers,
 * fix hyphenated line breaks. Keep page numbers attached.
 */
export function cleanText(text: string): string {
  let cleaned = text;

  // Fix hyphenated line breaks (e.g., "con-\ntinue" -> "continue")
  cleaned = cleaned.replace(/(\w)-\s*\r?\n\s*(\w)/g, '$1$2');

  // Normalize horizontal whitespace (tabs, multiple spaces) to single space
  cleaned = cleaned.replace(/[^\S\r\n]+/g, ' ');

  // Normalize multiple newlines to at most 2
  cleaned = cleaned.replace(/(\r?\n){3,}/g, '\n\n');

  // Strip standalone page-number lines (e.g. "Page 5", "- 5 -", "12")
  cleaned = cleaned.replace(/^\s*(?:Page\s+)?\d+\s*$/gim, '');
  cleaned = cleaned.replace(/^\s*-\s*\d+\s*-\s*$/gm, '');

  // Strip lines that are just repeated separator symbols
  cleaned = cleaned.replace(/^[=\-_*~]{3,}\s*$/gm, '');

  // Trim each line
  cleaned = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join('\n');

  return cleaned.trim();
}

/**
 * Clean per-page text and strip repeated headers/footers across pages.
 */
export function cleanPages(pages: string[]): string[] {
  if (pages.length <= 2) {
    return pages.map(cleanText);
  }

  // Detect repeated headers/footers (lines that appear on >50% of pages)
  const lineFrequency = new Map<string, number>();
  for (const page of pages) {
    const lines = page.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const firstLines = lines.slice(0, 3);
    const lastLines = lines.slice(-3);
    const candidates = [...firstLines, ...lastLines];
    const seenOnThisPage = new Set<string>();

    for (const line of candidates) {
      // Replace numbers with # to match patterns like "Chapter 1 ... page 1"
      const normalized = line.replace(/\d+/g, '#').trim();
      if (normalized.length > 3 && !seenOnThisPage.has(normalized)) {
        seenOnThisPage.add(normalized);
        lineFrequency.set(normalized, (lineFrequency.get(normalized) || 0) + 1);
      }
    }
  }

  const threshold = pages.length * 0.5;
  const repeatedPatterns = new Set<string>();
  for (const [pattern, count] of lineFrequency) {
    if (count >= threshold) {
      repeatedPatterns.add(pattern);
    }
  }

  return pages.map((page) => {
    let cleaned = page;
    if (repeatedPatterns.size > 0) {
      const lines = cleaned.split(/\r?\n/);
      const filtered = lines.filter((line) => {
        const normalized = line.trim().replace(/\d+/g, '#').trim();
        return !repeatedPatterns.has(normalized);
      });
      cleaned = filtered.join('\n');
    }
    return cleanText(cleaned);
  });
}

