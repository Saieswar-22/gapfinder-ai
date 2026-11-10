import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { topics, topicChunks, chunks, documents, pastPaperQuestions, subjects } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id: subjectId } = await params;

    // Verify ownership
    const [subject] = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, session.userId)))
      .limit(1);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    // Fetch all topics for subject
    const rawTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.subjectId, subjectId))
      .orderBy(asc(topics.orderIndex));

    // Fetch topic chunk mappings with document metadata
    const mappings = await db
      .select({
        topicId: topicChunks.topicId,
        score: topicChunks.score,
        documentName: documents.filename,
        pageStart: chunks.pageStart,
        pageEnd: chunks.pageEnd,
      })
      .from(topicChunks)
      .innerJoin(chunks, eq(chunks.id, topicChunks.chunkId))
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(eq(chunks.subjectId, subjectId));

    // Fetch linked past paper questions
    const ppqs = await db
      .select({
        id: pastPaperQuestions.id,
        topicId: pastPaperQuestions.topicId,
        page: pastPaperQuestions.page,
        text: pastPaperQuestions.text,
      })
      .from(pastPaperQuestions)
      .where(eq(pastPaperQuestions.subjectId, subjectId));

    // Group mappings and questions by topicId
    const mappingMap = new Map<string, typeof mappings>();
    for (const m of mappings) {
      const arr = mappingMap.get(m.topicId) || [];
      arr.push(m);
      mappingMap.set(m.topicId, arr);
    }

    const ppqMap = new Map<string, typeof ppqs>();
    for (const q of ppqs) {
      if (q.topicId) {
        const arr = ppqMap.get(q.topicId) || [];
        arr.push(q);
        ppqMap.set(q.topicId, arr);
      }
    }

    // Build hierarchy
    const nodeMap = new Map<string, any>();
    const roots: any[] = [];

    for (const t of rawTopics) {
      const node = {
        id: t.id,
        parentId: t.parentId,
        level: t.level,
        name: t.name,
        orderIndex: t.orderIndex,
        sourcePage: t.sourcePage,
        sourceQuote: t.sourceQuote,
        linkedMaterials: mappingMap.get(t.id) || [],
        linkedQuestions: ppqMap.get(t.id) || [],
        children: [],
      };
      nodeMap.set(t.id, node);
    }

    for (const t of rawTopics) {
      const node = nodeMap.get(t.id);
      if (t.parentId && nodeMap.has(t.parentId)) {
        nodeMap.get(t.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return NextResponse.json({
      topics: roots,
      totalCount: rawTopics.length,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch topic map' }, { status: 500 });
  }
}

