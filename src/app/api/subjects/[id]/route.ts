import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subjects, documents, topics, quizzes } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const [subject] = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, id), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const docCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(eq(documents.subjectId, id));

    const topicCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(topics)
      .where(eq(topics.subjectId, id));

    const quizCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizzes)
      .where(eq(quizzes.subjectId, id));

    return NextResponse.json({
      subject: {
        ...subject,
        documentCount: docCount[0]?.count ?? 0,
        topicCount: topicCount[0]?.count ?? 0,
        quizCount: quizCount[0]?.count ?? 0,
      },
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch subject' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const [deleted] = await db
      .delete(subjects)
      .where(and(eq(subjects.id, id), eq(subjects.userId, session.userId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: deleted.id });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete subject' }, { status: 500 });
  }
}
