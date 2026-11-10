import { describe, it, expect } from 'vitest';
import {
  allocateRevisionPlan,
  computePriorityScore,
} from '@/lib/plan/allocator';

describe('Plan Allocator Tests', () => {
  it('priority order: weak > medium > insufficient_data > strong', () => {
    const scoreWeak = computePriorityScore('weak', 4, 1);
    const scoreMedium = computePriorityScore('medium', 2, 2);
    const scoreInsufficient = computePriorityScore('insufficient_data', 0, 3);
    const scoreStrong = computePriorityScore('strong', 0, 4);

    expect(scoreWeak).toBeGreaterThan(scoreMedium);
    expect(scoreMedium).toBeGreaterThan(scoreInsufficient);
    expect(scoreInsufficient).toBeGreaterThan(scoreStrong);
  });

  it('never exceeds daily minutes for any day', () => {
    const daysAvailable = 3;
    const minutesPerDay = 45;

    const topics = [
      { id: '1', name: 'Topic A', orderIndex: 1, classification: 'weak' as const, incorrect: 3, attempted: 4 },
      { id: '2', name: 'Topic B', orderIndex: 2, classification: 'medium' as const, incorrect: 1, attempted: 3 },
      { id: '3', name: 'Topic C', orderIndex: 3, classification: 'insufficient_data' as const, incorrect: 0, attempted: 1 },
      { id: '4', name: 'Topic D', orderIndex: 4, classification: 'strong' as const, incorrect: 0, attempted: 5 },
    ];

    const tasks = allocateRevisionPlan({ topics, daysAvailable, minutesPerDay });

    expect(tasks.length).toBeGreaterThan(0);

    // Sum minutes per day
    const dayTotals = new Map<number, number>();
    for (const task of tasks) {
      const current = dayTotals.get(task.dayNumber) || 0;
      dayTotals.set(task.dayNumber, current + task.minutes);
    }

    for (const [day, total] of dayTotals.entries()) {
      expect(total).toBeLessThanOrEqual(minutesPerDay);
    }
  });

  it('allocates a final retest task on the last day', () => {
    const daysAvailable = 4;
    const minutesPerDay = 30;

    const topics = [
      { id: '1', name: 'Calculus', orderIndex: 1, classification: 'weak' as const, incorrect: 3, attempted: 4 },
    ];

    const tasks = allocateRevisionPlan({ topics, daysAvailable, minutesPerDay });
    const finalDayTasks = tasks.filter((t) => t.dayNumber === daysAvailable);
    const retestTask = finalDayTasks.find((t) => t.taskType === 'retest');

    expect(retestTask).toBeDefined();
    expect(retestTask?.taskType).toBe('retest');
  });
});
