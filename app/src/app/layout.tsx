import type { Metadata } from 'next';
import { Providers } from './providers';
import { NavBar } from '../components/NavBar';
import { ScrapingLimitProvider } from '../context/ScrapingLimitContext';
import { UsageLimitBanner } from '../components/UsageLimitBanner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import './globals.css';

export const metadata: Metadata = {
  title: 'Social Report Agent',
  description: 'Social media analytics dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ScrapingLimitProvider>
            <UsageLimitBanner />
            <NavBar />
            <main className="max-w-screen-2xl mx-auto px-4 py-6">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
          </ScrapingLimitProvider>
        </Providers>
      </body>
    </html>
  );
}
