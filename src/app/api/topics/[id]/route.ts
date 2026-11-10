import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { topics, subjects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';

const updateTopicSchema = z.object({
  name: z.string().min(1, 'Name is required').max(500),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: topicId } = await params;
    const body = await request.json();

    const parsed = updateTopicSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    // Verify ownership via subject
    const [existing] = await db
      .select({ topicId: topics.id, subjectUserId: subjects.userId })
      .from(topics)
      .innerJoin(subjects, eq(subjects.id, topics.subjectId))
      .where(and(eq(topics.id, topicId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Topic not found or unauthorized' }, { status: 404 });
    }

    const [updated] = await db
      .update(topics)
      .set({ name: parsed.data.name.trim() })
      .where(eq(topics.id, topicId))
      .returning();

    return NextResponse.json({ topic: updated });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update topic' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: topicId } = await params;

    // Verify ownership via subject
    const [existing] = await db
      .select({ topicId: topics.id, subjectUserId: subjects.userId })
      .from(topics)
      .innerJoin(subjects, eq(subjects.id, topics.subjectId))
      .where(and(eq(topics.id, topicId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Topic not found or unauthorized' }, { status: 404 });
    }

    await db.delete(topics).where(eq(topics.id, topicId));

    return NextResponse.json({ success: true, deletedId: topicId });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete topic' }, { status: 500 });
  }
}

