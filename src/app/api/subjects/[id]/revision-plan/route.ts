import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { revisionPlans, planTasks, topics, subjects } from '@/lib/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { createOrAdaptRevisionPlan } from '@/lib/plan/plan-service';

const createPlanSchema = z.object({
  daysAvailable: z.number().int().min(1).max(30),
  minutesPerDay: z.number().int().min(15).max(360),
});

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;

    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const versionParam = searchParams.get('version');

    // List all plan versions
    const allVersions = await db
      .select({
        id: revisionPlans.id,
        version: revisionPlans.version,
        isActive: revisionPlans.isActive,
        daysAvailable: revisionPlans.daysAvailable,
        minutesPerDay: revisionPlans.minutesPerDay,
        createdAt: revisionPlans.createdAt,
      })
      .from(revisionPlans)
      .where(and(eq(revisionPlans.subjectId, subjectId), eq(revisionPlans.userId, session.userId)))
      .orderBy(desc(revisionPlans.version));

    if (allVersions.length === 0) {
      return NextResponse.json({ plan: null, versions: [] });
    }

    // Select active or specified version
    let targetPlan = allVersions.find((p) => p.isActive) || allVersions[0];
    if (versionParam) {
      const found = allVersions.find((p) => p.version === parseInt(versionParam));
      if (found) targetPlan = found;
    }

    // Fetch tasks for plan
    const tasks = await db
      .select({
        id: planTasks.id,
        topicId: planTasks.topicId,
        topicName: topics.name,
        dayNumber: planTasks.dayNumber,
        taskType: planTasks.taskType,
        description: planTasks.description,
        minutes: planTasks.minutes,
        completed: planTasks.completed,
        completedAt: planTasks.completedAt,
      })
      .from(planTasks)
      .leftJoin(topics, eq(topics.id, planTasks.topicId))
      .where(eq(planTasks.planId, targetPlan.id))
      .orderBy(asc(planTasks.dayNumber), asc(planTasks.id));

    const totalMinutes = tasks.reduce((sum, t) => sum + t.minutes, 0);
    const completedTasks = tasks.filter((t) => t.completed).length;
    const progressPercent = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

    return NextResponse.json({
      plan: {
        ...targetPlan,
        totalMinutes,
        completedTasks,
        totalTasks: tasks.length,
        progressPercent,
      },
      tasks,
      versions: allVersions,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch revision plan' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;
    const body = await request.json();

    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    // Verify ownership
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const result = await createOrAdaptRevisionPlan({
      subjectId,
      userId: session.userId,
      daysAvailable: parsed.data.daysAvailable,
      minutesPerDay: parsed.data.minutesPerDay,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Plan generation error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create revision plan' }, { status: 500 });
  }
}

