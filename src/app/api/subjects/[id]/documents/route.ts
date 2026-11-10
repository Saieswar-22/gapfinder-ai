import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subjects, documents, chunks } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import {
  validateFileType,
  extractPdfText,
  extractTxtText,
  hasExtractableText,
  computeContentHash,
} from '@/lib/processing/extract';
import { cleanPages } from '@/lib/processing/clean';
import { chunkPages } from '@/lib/processing/chunk';

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;

    // Verify subject ownership
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const docs = await db
      .select({
        id: documents.id,
        filename: documents.filename,
        docType: documents.docType,
        pageCount: documents.pageCount,
        status: documents.status,
        errorMessage: documents.errorMessage,
        createdAt: documents.createdAt,
        totalChunks: sql<number>`count(${chunks.id})::int`,
        embeddedChunks: sql<number>`count(CASE WHEN ${chunks.embedding} IS NOT NULL THEN 1 END)::int`,
      })
      .from(documents)
      .leftJoin(chunks, eq(chunks.documentId, documents.id))
      .where(eq(documents.subjectId, subjectId))
      .groupBy(documents.id)
      .orderBy(desc(documents.createdAt));

    return NextResponse.json({ documents: docs });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;

    // Verify subject ownership
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const docType = (formData.get('doc_type') as string) || 'other';

    const validDocTypes = ['syllabus', 'textbook', 'notes', 'past_paper', 'other'];
    if (!validDocTypes.includes(docType)) {
      return NextResponse.json({ error: `Invalid document type: ${docType}` }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file type & size
    const validation = validateFileType(buffer, file.name, file.type);
    if (!validation.valid || !validation.type) {
      return NextResponse.json({ error: validation.error || 'Invalid file' }, { status: 400 });
    }

    // Check duplicate hash
    const contentHash = computeContentHash(buffer);
    const existing = await db
      .select({ id: documents.id, filename: documents.filename })
      .from(documents)
      .where(and(eq(documents.subjectId, subjectId), eq(documents.contentHash, contentHash)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        {
          error: `Duplicate file detected: "${existing[0].filename}" has identical content in this subject.`,
        },
        { status: 409 }
      );
    }

    // Extract text
    let pages: string[] = [];
    let pageCount = 1;

    try {
      if (validation.type === 'pdf') {
        const result = await extractPdfText(buffer);
        pages = result.pages;
        pageCount = result.pageCount;
      } else {
        const result = extractTxtText(buffer);
        pages = result.pages;
        pageCount = result.pageCount;
      }
    } catch (extractErr: any) {
      return NextResponse.json(
        { error: `Extraction failed: ${extractErr.message || 'unreadable file'}` },
        { status: 400 }
      );
    }

    // Clean pages
    const cleanedPages = cleanPages(pages);

    // Check if sufficient text was extracted
    if (!hasExtractableText(cleanedPages)) {
      return NextResponse.json(
        {
          error:
            'No readable text found in document. Scanned image-only PDFs without a text layer are not supported.',
        },
        { status: 400 }
      );
    }

    // Create chunks
    const chunkList = chunkPages(cleanedPages);
    if (chunkList.length === 0) {
      return NextResponse.json(
        { error: 'Document yielded no usable text paragraphs after cleaning.' },
        { status: 400 }
      );
    }

    // Save document as 'processing'
    const [doc] = await db
      .insert(documents)
      .values({
        subjectId,
        userId: session.userId,
        filename: file.name,
        docType: docType as any,
        contentHash,
        pageCount,
        status: 'processing',
      })
      .returning();

    // Insert chunks (unembedded initially)
    const chunkInserts = chunkList.map((c) => ({
      documentId: doc.id,
      subjectId,
      userId: session.userId,
      chunkIndex: c.chunkIndex,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      text: c.text,
      tokenEstimate: c.tokenEstimate,
      embedding: null,
    }));

    // Insert in batches of 50 to avoid query size limits
    const BATCH = 50;
    for (let i = 0; i < chunkInserts.length; i += BATCH) {
      await db.insert(chunks).values(chunkInserts.slice(i, i + BATCH));
    }

    return NextResponse.json(
      {
        document: {
          ...doc,
          chunkCount: chunkList.length,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Document upload error:', err);
    return NextResponse.json({ error: err.message || 'Upload processing failed' }, { status: 500 });
  }
}

