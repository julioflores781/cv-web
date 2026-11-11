import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionShell } from '@/components/ui/section-shell';
import { getConfig } from '@/lib/api';
import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: '404',
  robots: { index: false, follow: false },
};

// Inline on purpose: a CSS module here makes Next.js preload its chunk on every page (not-found boundary), and the
// browser then warns in the console that the preloaded stylesheet was never used.
const TITLE_STYLE = { fontSize: 'clamp(56px, 8.4vw, 124px)', fontWeight: 700, lineHeight: 0.9 } as const;

export default function NotFound() {
  const { siteUrl } = getConfig();
  return (
    <html lang="es" className={fontVariables}>
      <body>
        <main>
          <SectionShell labelledBy="not-found-title" last>
            <div>
              <h1 id="not-found-title" className="display" style={TITLE_STYLE}>
                404
              </h1>
              <p>
                <Link href="/">{new URL(siteUrl).host}</Link>
              </p>
            </div>
          </SectionShell>
        </main>
      </body>
    </html>
  );
}
