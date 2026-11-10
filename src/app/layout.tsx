import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GapFinder AI',
  description: 'Find what you don\'t know — AI-powered diagnostic learning',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}

