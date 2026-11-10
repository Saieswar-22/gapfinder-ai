import { describe, it, expect } from 'vitest';
import { validateMCQ, isDuplicateStem } from '@/lib/quiz/validation';

describe('MCQ Validator Tests', () => {
  const sampleContext = `Photosynthesis is the process used by plants to convert light energy into chemical energy.
The main pigment responsible is chlorophyll. Oxygen is released as a byproduct.`;

  it('validates a well-formed grounded question', () => {
    const valid = validateMCQ({
      question: 'What is the main pigment responsible for photosynthesis in plants?',
      options: ['Chlorophyll', 'Hemoglobin', 'Melanin', 'Carotenoid'],
      correctIndex: 0,
      explanation: 'Chlorophyll is the primary pigment capturing light energy.',
      supportingQuote: 'The main pigment responsible is chlorophyll.',
      citations: [{ document: 'biology_notes.pdf', page: 1 }],
      context: sampleContext,
    });

    expect(valid.valid).toBe(true);
    expect(valid.error).toBeUndefined();
  });

  it('rejects questions with wrong option count', () => {
    const invalid = validateMCQ({
      question: 'What is the main pigment responsible for photosynthesis?',
      options: ['Chlorophyll', 'Hemoglobin', 'Melanin'], // only 3 options
      correctIndex: 0,
      explanation: 'Explanation',
      supportingQuote: 'The main pigment responsible is chlorophyll.',
      citations: [{ document: 'doc.pdf', page: 1 }],
      context: sampleContext,
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('exactly 4 options');
  });

  it('rejects questions with duplicate options', () => {
    const invalid = validateMCQ({
      question: 'What is the main pigment responsible for photosynthesis?',
      options: ['Chlorophyll', 'Chlorophyll', 'Melanin', 'Carotenoid'],
      correctIndex: 0,
      explanation: 'Explanation',
      supportingQuote: 'The main pigment responsible is chlorophyll.',
      citations: [{ document: 'doc.pdf', page: 1 }],
      context: sampleContext,
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('duplicate options');
  });

  it('rejects questions with ungrounded supporting quotes', () => {
    const invalid = validateMCQ({
      question: 'What happens during cellular respiration in animals?',
      options: ['Produces ATP', 'Generates chlorophyll', 'Releases nitrogen', 'Freezes water'],
      correctIndex: 0,
      explanation: 'Explanation',
      supportingQuote: 'Cellular respiration produces ATP in the mitochondria of animal cells.',
      citations: [{ document: 'doc.pdf', page: 1 }],
      context: sampleContext, // does not mention ATP or mitochondria
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('Supporting quote could not be verified');
  });

  it('detects duplicate stems', () => {
    const existingStems = [
      'What is the main pigment responsible for photosynthesis in plants?',
    ];

    expect(
      isDuplicateStem('What is the main pigment responsible for photosynthesis in plants?', existingStems)
    ).toBe(true);

    expect(
      isDuplicateStem('What is the main pigment responsible for photosynthesis?', existingStems)
    ).toBe(true);

    expect(
      isDuplicateStem('What is the byproduct of photosynthesis?', existingStems)
    ).toBe(false);
  });
});
