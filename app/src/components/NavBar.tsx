'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Reports', href: '/' },
  { label: 'Analysis', href: '/analysis' },
  { label: 'Competitor Analysis', href: '/competitor-analysis' },
  { label: 'Settings', href: '/settings' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
      <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center gap-4">
        {/* Branding */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="7" width="3" height="6" rx="1" fill="white" />
              <rect x="5.5" y="4" width="3" height="9" rx="1" fill="white" />
              <rect x="10" y="1" width="3" height="12" rx="1" fill="white" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-gray-900">Social Report Agent</span>
        </div>
        <span className="text-gray-300">|</span>
        <span className="text-xs text-gray-500">Grapes Worldwide</span>

        {/* Navigation */}
        <nav className="ml-auto flex items-center gap-1">
          {NAV_ITEMS.map(({ label, href }) => {
            const isActive =
              href === '/' ? pathname === '/' : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-4 text-sm transition-colors border-b-2 ${
                  isActive
                    ? 'text-brand-600 border-brand-600 font-medium'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
