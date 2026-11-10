import { CONFIG } from '@/lib/config';
import type { TopicAttemptStats, Classification } from '@/lib/gap/classifier';

export type TaskType = 'review' | 'practice' | 'retest';

export interface AllocatedTask {
  topicId: string;
  topicName: string;
  dayNumber: number;
  taskType: TaskType;
  minutes: number;
  priorityScore: number;
  description: string;
}

export interface PlanAllocationInput {
  topics: {
    id: string;
    name: string;
    orderIndex: number;
    classification: Classification;
    incorrect: number;
    attempted: number;
  }[];
  daysAvailable: number;
  minutesPerDay: number;
}

/**
 * Computes deterministic priority score for a topic.
 * Weak > Medium > Insufficient Data > Strong.
 * Weighted by number of incorrect answers and syllabus order.
 */
export function computePriorityScore(
  classification: Classification,
  incorrectCount: number,
  orderIndex: number
): number {
  let baseWeight: number;
  switch (classification) {
    case 'weak':
      baseWeight = 1000;
      break;
    case 'medium':
      baseWeight = 500;
      break;
    case 'insufficient_data':
      baseWeight = 250;
      break;
    case 'strong':
    default:
      baseWeight = 50;
      break;
  }

  // More wrong answers gives higher priority
  const errorBonus = incorrectCount * 25;

  // Earlier in syllabus has slight priority break-tie (negative order penalty)
  const orderBonus = Math.max(0, 100 - orderIndex);

  return baseWeight + errorBonus + orderBonus;
}

/**
 * Deterministic revision plan allocator.
 * Guarantees:
 * 1. Daily minutes NEVER exceed minutesPerDay for any day.
 * 2. Higher priority topics receive study time before lower priority topics.
 * 3. Strong topics receive maintenance share.
 * 4. Final day includes a retest task.
 */
export function allocateRevisionPlan(input: PlanAllocationInput): AllocatedTask[] {
  const { topics, daysAvailable, minutesPerDay } = input;
  if (daysAvailable <= 0 || minutesPerDay <= 0 || topics.length === 0) {
    return [];
  }

  const totalAvailableMinutes = daysAvailable * minutesPerDay;

  // Deduct retest budget (15 mins on the final day, or less if small budget)
  const retestMinutes = Math.min(CONFIG.RETEST_MINUTES, Math.floor(minutesPerDay * 0.5));
  const studyMinutesBudget = Math.max(0, totalAvailableMinutes - retestMinutes);

  // Score topics
  const scoredTopics = topics.map((t) => ({
    ...t,
    priorityScore: computePriorityScore(t.classification, t.incorrect, t.orderIndex),
  }));

  // Sort descending by priority score
  scoredTopics.sort((a, b) => b.priorityScore - a.priorityScore);

  // Distribute study minutes proportionally
  const totalScore = scoredTopics.reduce((sum, t) => sum + t.priorityScore, 0);

  const topicAllocations: { topic: typeof scoredTopics[0]; minutes: number }[] = [];
  let allocatedMinutes = 0;

  for (const t of scoredTopics) {
    // Proportional share with min 10 min chunks
    const share = totalScore > 0 ? (t.priorityScore / totalScore) * studyMinutesBudget : 0;
    const rounded = Math.round(share / 5) * 5; // round to multiple of 5 mins
    const mins = Math.max(rounded, t.classification === 'strong' ? 5 : 10);

    if (allocatedMinutes + mins <= studyMinutesBudget) {
      topicAllocations.push({ topic: t, minutes: mins });
      allocatedMinutes += mins;
    } else {
      const remaining = studyMinutesBudget - allocatedMinutes;
      if (remaining >= 5) {
        topicAllocations.push({ topic: t, minutes: remaining });
        allocatedMinutes += remaining;
      }
      break;
    }
  }

  // Create tasks and spread across days, strictly respecting minutesPerDay
  const tasks: AllocatedTask[] = [];
  const dayMinutesUsed = new Array(daysAvailable).fill(0);

  // Reserve retest minutes on the final day
  dayMinutesUsed[daysAvailable - 1] += retestMinutes;

  for (const item of topicAllocations) {
    let taskMinutesRemaining = item.minutes;

    while (taskMinutesRemaining > 0) {
      // Find the first day with capacity
      let targetDay = -1;
      for (let d = 0; d < daysAvailable; d++) {
        if (dayMinutesUsed[d] < minutesPerDay) {
          targetDay = d;
          break;
        }
      }

      if (targetDay === -1) {
        // No more capacity on any day
        break;
      }

      const availableOnDay = minutesPerDay - dayMinutesUsed[targetDay];
      const allocChunk = Math.min(taskMinutesRemaining, availableOnDay);

      const taskType: TaskType =
        item.topic.classification === 'weak' ? 'review' : 'practice';

      tasks.push({
        topicId: item.topic.id,
        topicName: item.topic.name,
        dayNumber: targetDay + 1,
        taskType,
        minutes: allocChunk,
        priorityScore: item.topic.priorityScore,
        description: `Study and practice key concepts of ${item.topic.name}.`,
      });

      dayMinutesUsed[targetDay] += allocChunk;
      taskMinutesRemaining -= allocChunk;
    }
  }

  // Append final retest task on the last day
  const topPriorityTopic = scoredTopics[0];
  tasks.push({
    topicId: topPriorityTopic?.id || topics[0].id,
    topicName: topPriorityTopic?.name || topics[0].name,
    dayNumber: daysAvailable,
    taskType: 'retest',
    minutes: retestMinutes,
    priorityScore: 9999,
    description: `Complete a diagnostic retest to verify gap closure across studied topics.`,
  });

  // Sort tasks by dayNumber
  tasks.sort((a, b) => a.dayNumber - b.dayNumber);

  return tasks;
}

