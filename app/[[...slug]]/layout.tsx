import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { resolveRoute } from '@/lib/i18n/routes';
import { fontVariables } from '../fonts';
import '../globals.css';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ slug?: string[] }>;
}

export default async function RootLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const route = resolveRoute(slug) ?? notFound();
  return (
    <html lang={route.lang} className={fontVariables}>
      <body data-mode={route.page} data-probe="page">
        {children}
      </body>
    </html>
  );
}
