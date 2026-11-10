import { requireSession } from '@/lib/auth/session';
import { Navbar } from '@/components/Navbar';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar userEmail={session.email} />
      <main className="max-w-[900px] mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}

