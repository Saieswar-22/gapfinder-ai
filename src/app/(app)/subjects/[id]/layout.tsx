import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { subjects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { SubjectTabs } from '@/components/SubjectTabs';
import Link from 'next/link';

export default async function SubjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const [subject] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, id), eq(subjects.userId, session.userId)))
    .limit(1);

  if (!subject) {
    notFound();
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">
          <Link href="/subjects" className="hover:underline text-blue-600">
            ← All Subjects
          </Link>
        </div>
        <h1 className="text-2xl font-bold">{subject.name}</h1>
        {subject.description && (
          <p className="text-sm text-gray-600 mt-1">{subject.description}</p>
        )}
      </div>

      <SubjectTabs subjectId={id} />

      <div>{children}</div>
    </div>
  );
}

