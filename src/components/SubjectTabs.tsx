'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SubjectTabs({ subjectId }: { subjectId: string }) {
  const pathname = usePathname();

  const tabs = [
    { name: 'Documents', href: `/subjects/${subjectId}/documents` },
    { name: 'Topic Map', href: `/subjects/${subjectId}/topic-map` },
    { name: 'Quiz', href: `/subjects/${subjectId}/quiz` },
    { name: 'Gap Report', href: `/subjects/${subjectId}/gap-report` },
    { name: 'Revision Plan', href: `/subjects/${subjectId}/revision-plan` },
    { name: 'Ask Assistant', href: `/subjects/${subjectId}/assistant` },
    { name: 'Progress', href: `/subjects/${subjectId}/progress` },
  ];

  return (
    <div className="border-b border-gray-200 mb-6 overflow-x-auto">
      <nav className="flex space-x-6 text-sm whitespace-nowrap">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`py-2 px-1 border-b-2 font-medium transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
