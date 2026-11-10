'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

export function Navbar({ userEmail }: { userEmail?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link href="/dashboard" className="font-bold text-lg text-blue-600">
            GapFinder AI
          </Link>
          <nav className="flex space-x-4 text-sm">
            <Link
              href="/dashboard"
              className={pathname === '/dashboard' ? 'font-semibold text-blue-600' : 'text-gray-700 hover:text-black'}
            >
              Dashboard
            </Link>
            <Link
              href="/subjects"
              className={pathname.startsWith('/subjects') ? 'font-semibold text-blue-600' : 'text-gray-700 hover:text-black'}
            >
              Subjects
            </Link>
          </nav>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          {userEmail && <span className="text-gray-500">{userEmail}</span>}
          <button
            onClick={handleLogout}
            className="text-gray-600 hover:text-red-600 border border-gray-300 rounded px-2.5 py-1 text-xs"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

