import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subjects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { buildTopicMap } from '@/lib/topic/topic-service';

export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;

    // Verify ownership
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const result = await buildTopicMap(subjectId, session.userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message || 'Failed to extract topics' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Topic map generation error:', err);
    return NextResponse.json(
      { error: err.message || 'Topic map generation failed' },
      { status: 500 }
    );
  }
}

