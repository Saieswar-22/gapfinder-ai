import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { embedDocumentBatch } from '@/lib/processing/embed';

export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: documentId } = await params;

    // Verify ownership
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, session.userId)))
      .limit(1);

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    try {
      const result = await embedDocumentBatch(documentId);
      return NextResponse.json(result);
    } catch (embedError: any) {
      console.error('Embedding error for document:', documentId, embedError);
      await db
        .update(documents)
        .set({
          status: 'failed',
          errorMessage: embedError.message || 'Embedding generation failed',
        })
        .where(eq(documents.id, documentId));

      return NextResponse.json(
        { error: embedError.message || 'Embedding generation failed' },
        { status: 500 }
      );
    }
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

