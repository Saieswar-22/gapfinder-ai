import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { planTasks, revisionPlans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';

const toggleTaskSchema = z.object({
  completed: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    const body = await request.json();

    const parsed = toggleTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    // Verify ownership via revisionPlans
    const [taskOwner] = await db
      .select({
        taskId: planTasks.id,
        userId: revisionPlans.userId,
      })
      .from(planTasks)
      .innerJoin(revisionPlans, eq(revisionPlans.id, planTasks.planId))
      .where(and(eq(planTasks.id, taskId), eq(revisionPlans.userId, session.userId)))
      .limit(1);

    if (!taskOwner) {
      return NextResponse.json({ error: 'Task not found or unauthorized' }, { status: 404 });
    }

    const [updated] = await db
      .update(planTasks)
      .set({
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
      })
      .where(eq(planTasks.id, taskId))
      .returning();

    return NextResponse.json({ task: updated });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
