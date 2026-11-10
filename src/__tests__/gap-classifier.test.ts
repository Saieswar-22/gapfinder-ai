import { describe, it, expect } from 'vitest';
import {
  classifyTopicStats,
  computeCumulativeClassification,
} from '@/lib/gap/classifier';
import { CONFIG } from '@/lib/config';

describe('Gap Classifier Tests', () => {
  it('classifies fewer than MIN_ATTEMPTS as insufficient_data', () => {
    // Default MIN_ATTEMPTS_FOR_CLASSIFICATION is 2
    const stats0 = classifyTopicStats('t1', 'Linear Equations', 0, 0);
    expect(stats0.classification).toBe('insufficient_data');
    expect(stats0.isLowConfidence).toBe(true);

    const stats1 = classifyTopicStats('t1', 'Linear Equations', 1, 1);
    expect(stats1.classification).toBe('insufficient_data');
    expect(stats1.reason).toContain('need at least');
  });

  it('classifies 75%+ as strong with proper reason', () => {
    const stats = classifyTopicStats('t1', 'Polynomials', 4, 3); // 75%
    expect(stats.classification).toBe('strong');
    expect(stats.accuracy).toBe(0.75);
    expect(stats.reason).toContain('meets strong threshold');
  });

  it('classifies 50% - 74% as medium', () => {
    const stats = classifyTopicStats('t1', 'Calculus', 4, 2); // 50%
    expect(stats.classification).toBe('medium');
    expect(stats.accuracy).toBe(0.5);
    expect(stats.reason).toContain('meets medium threshold');
  });

  it('classifies < 50% as weak', () => {
    const stats = classifyTopicStats('t1', 'Trigonometry', 4, 1); // 25%
    expect(stats.classification).toBe('weak');
    expect(stats.accuracy).toBe(0.25);
    expect(stats.reason).toContain('below medium threshold');
  });

  it('labels low confidence between 2 and 4 attempts', () => {
    const stats = classifyTopicStats('t1', 'Vectors', 3, 3);
    expect(stats.isLowConfidence).toBe(true);
    expect(stats.reason).toContain('Low confidence');

    const confidentStats = classifyTopicStats('t1', 'Vectors', 8, 7);
    expect(confidentStats.isLowConfidence).toBe(false);
    expect(confidentStats.reason).not.toContain('Low confidence');
  });

  it('applies recency weighting in cumulative classification', () => {
    // Attempt 1: 0/2 (0%)
    // Attempt 2: 2/2 (100%)
    // With RECENCY_WEIGHT = 0.6, weighted accuracy = 1.0 * 0.6 + 0.0 * 0.4 = 0.60 (medium)
    const cumulative = computeCumulativeClassification('t1', 'Matrices', [
      { attempted: 2, correct: 0 },
      { attempted: 2, correct: 2 },
    ]);

    expect(cumulative.attempted).toBe(4);
    expect(cumulative.correct).toBe(2);
    expect(cumulative.accuracy).toBeCloseTo(0.6, 2);
    expect(cumulative.classification).toBe('medium');
    expect(cumulative.reason).toContain('Recency-weighted');
  });
});
