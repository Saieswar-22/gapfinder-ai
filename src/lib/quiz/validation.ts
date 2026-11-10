import { isQuoteGrounded, normalizeForMatch } from '@/lib/rag/generation';

export interface ValidatedQuestionInput {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  supportingQuote: string;
  citations: { document: string; page: number }[];
  context: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a generated MCQ against strict quality gates:
 * 1. Exactly 4 options.
 * 2. Exactly 1 valid correct_index (0 to 3).
 * 3. Non-empty question stem and explanation.
 * 4. At least one valid citation with document and page.
 * 5. Supporting quote is present in the context (fuzzy or exact).
 */
export function validateMCQ(input: ValidatedQuestionInput): ValidationResult {
  const { question, options, correctIndex, explanation, supportingQuote, citations, context } =
    input;

  if (!question || question.trim().length < 5) {
    return { valid: false, error: 'Question stem is missing or too short' };
  }

  if (!Array.isArray(options) || options.length !== 4) {
    return { valid: false, error: `Must have exactly 4 options, found ${options?.length ?? 0}` };
  }

  for (let i = 0; i < options.length; i++) {
    if (!options[i] || options[i].trim().length === 0) {
      return { valid: false, error: `Option ${i + 1} is empty` };
    }
  }

  // Check for duplicate options
  const uniqueOptions = new Set(options.map((o) => o.trim().toLowerCase()));
  if (uniqueOptions.size !== 4) {
    return { valid: false, error: 'Question contains duplicate options' };
  }

  if (typeof correctIndex !== 'number' || correctIndex < 0 || correctIndex > 3) {
    return { valid: false, error: `Invalid correctIndex: ${correctIndex}. Must be 0, 1, 2, or 3.` };
  }

  if (!explanation || explanation.trim().length === 0) {
    return { valid: false, error: 'Missing explanation' };
  }

  if (!Array.isArray(citations) || citations.length === 0) {
    return { valid: false, error: 'Question is missing document citations' };
  }

  for (const c of citations) {
    if (!c.document || typeof c.page !== 'number') {
      return { valid: false, error: 'Invalid citation format' };
    }
  }

  if (!supportingQuote || supportingQuote.trim().length === 0) {
    return { valid: false, error: 'Missing supporting quote' };
  }

  // Quote grounding check
  if (!isQuoteGrounded(supportingQuote, context)) {
    return {
      valid: false,
      error: 'Supporting quote could not be verified in the source context',
    };
  }

  return { valid: true };
}

/**
 * Checks if a question stem is a duplicate of any existing stems.
 */
export function isDuplicateStem(newStem: string, existingStems: string[]): boolean {
  const normNew = normalizeForMatch(newStem);
  for (const existing of existingStems) {
    const normExisting = normalizeForMatch(existing);
    if (normNew === normExisting) return true;

    // Word jaccard similarity check
    const wordsNew = new Set(normNew.split(' '));
    const wordsExisting = new Set(normExisting.split(' '));
    const intersection = new Set([...wordsNew].filter((x) => wordsExisting.has(x)));
    const union = new Set([...wordsNew, ...wordsExisting]);
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;
    const overlapMin = Math.min(wordsNew.size, wordsExisting.size);
    const overlapRatio = overlapMin > 0 ? intersection.size / overlapMin : 0;

    if (jaccard >= 0.75 || overlapRatio >= 0.85) {
      return true;
    }
  }
  return false;
}
