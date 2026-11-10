import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { subjects, documents } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';

const createSubjectSchema = z.object({
  name: z.string().min(1, 'Subject name is required').max(255),
  description: z.string().max(1000).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();

    const userSubjects = await db
      .select({
        id: subjects.id,
        name: subjects.name,
        description: subjects.description,
        createdAt: subjects.createdAt,
        documentCount: sql<number>`count(${documents.id})::int`,
      })
      .from(subjects)
      .leftJoin(documents, eq(documents.subjectId, subjects.id))
      .where(eq(subjects.userId, session.userId))
      .groupBy(subjects.id)
      .orderBy(desc(subjects.createdAt));

    return NextResponse.json({ subjects: userSubjects });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Failed to fetch subjects:', err);
    return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();

    const parsed = createSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const [newSubject] = await db
      .insert(subjects)
      .values({
        userId: session.userId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
      })
      .returning();

    return NextResponse.json({ subject: newSubject }, { status: 201 });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Failed to create subject:', err);
    return NextResponse.json({ error: 'Failed to create subject' }, { status: 500 });
  }
}
