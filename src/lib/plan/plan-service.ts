import { db } from '@/lib/db';
import {
  revisionPlans,
  planTasks,
  topics,
  chunks,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getCumulativeGapReport } from '@/lib/gap/gap-service';
import { allocateRevisionPlan, type AllocatedTask } from './allocator';
import { generateTaskDescriptions } from '@/lib/rag/generation';
import { retrieveChunksForTopic } from '@/lib/rag/retrieval';

export interface GeneratePlanOptions {
  subjectId: string;
  userId: string;
  daysAvailable: number;
  minutesPerDay: number;
  basedOnAttemptId?: string;
}

export async function createOrAdaptRevisionPlan(options: GeneratePlanOptions) {
  const { subjectId, userId, daysAvailable, minutesPerDay, basedOnAttemptId } = options;

  // 1. Get current cumulative gap report for subject
  const gapData = await getCumulativeGapReport(subjectId, userId);

  // 2. Fetch all topics with order index
  const allTopics = await db
    .select({
      id: topics.id,
      name: topics.name,
      orderIndex: topics.orderIndex,
    })
    .from(topics)
    .where(eq(topics.subjectId, subjectId))
    .orderBy(topics.orderIndex);

  const topicOrderMap = new Map(allTopics.map((t) => [t.id, t.orderIndex]));

  // 3. Prepare inputs for allocator
  const allocationInputs = gapData.items.map((item) => ({
    id: item.topicId,
    name: item.topicName,
    orderIndex: topicOrderMap.get(item.topicId) ?? 0,
    classification: item.classification,
    incorrect: item.incorrect,
    attempted: item.attempted,
  }));

  // 4. Run deterministic allocator
  const allocatedTasks = allocateRevisionPlan({
    topics: allocationInputs,
    daysAvailable,
    minutesPerDay,
  });

  // 5. Check if there was an active previous plan to carry over completed tasks and increment version
  const [activePlan] = await db
    .select()
    .from(revisionPlans)
    .where(
      and(
        eq(revisionPlans.subjectId, subjectId),
        eq(revisionPlans.userId, userId),
        eq(revisionPlans.isActive, true)
      )
    )
    .orderBy(desc(revisionPlans.version))
    .limit(1);

  let newVersion = 1;
  const previouslyCompletedTopics = new Set<string>();

  if (activePlan) {
    newVersion = activePlan.version + 1;

    // Fetch completed tasks from active plan
    const completedTasks = await db
      .select({ topicId: planTasks.topicId })
      .from(planTasks)
      .where(and(eq(planTasks.planId, activePlan.id), eq(planTasks.completed, true)));

    for (const ct of completedTasks) {
      if (ct.topicId) previouslyCompletedTopics.add(ct.topicId);
    }

    // Mark previous plan inactive
    await db
      .update(revisionPlans)
      .set({ isActive: false })
      .where(eq(revisionPlans.id, activePlan.id));
  }

  // 6. Generate grounded descriptions (with fallback to templates)
  // Retrieve sample chunks for task generation
  let sampleChunks: any[] = [];
  try {
    if (allocatedTasks.length > 0) {
      sampleChunks = await retrieveChunksForTopic(
        subjectId,
        userId,
        allocatedTasks[0].topicName,
        undefined,
        4
      );
    }
  } catch (err) {
    console.warn('Could not retrieve chunks for task descriptions:', err);
  }

  const topicNames = allocatedTasks.map((t) => t.topicName);
  const taskTypes = allocatedTasks.map((t) => t.taskType);

  const descriptions = await generateTaskDescriptions(topicNames, taskTypes, sampleChunks);

  // 7. Save new revision plan
  const [newPlan] = await db
    .insert(revisionPlans)
    .values({
      subjectId,
      userId,
      daysAvailable,
      minutesPerDay,
      basedOnAttemptId: basedOnAttemptId || null,
      version: newVersion,
      isActive: true,
    })
    .returning();

  // 8. Insert plan tasks
  for (let i = 0; i < allocatedTasks.length; i++) {
    const task = allocatedTasks[i];
    const desc = descriptions[i] || task.description;
    const isAlreadyCompleted = previouslyCompletedTopics.has(task.topicId);

    await db.insert(planTasks).values({
      planId: newPlan.id,
      topicId: task.topicId,
      dayNumber: task.dayNumber,
      taskType: task.taskType,
      description: desc,
      minutes: task.minutes,
      completed: isAlreadyCompleted,
      completedAt: isAlreadyCompleted ? new Date() : null,
    });
  }

  return { planId: newPlan.id, version: newVersion };
}
