import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '../fonts';
import '../globals.css';

// The panel is its own root layout (Spanish only, light «obra» mode) so none of the public page's state leaks in.
export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel' },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={fontVariables}>
      <body data-mode="services">{children}</body>
    </html>
  );
}
