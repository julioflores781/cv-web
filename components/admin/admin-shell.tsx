'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { UI } from '@/lib/admin/messages';
import type { NavItem } from '@/lib/admin/nav';
import { LogoutButton } from './session-actions';
import styles from './admin-shell.module.css';

const trim = (path: string): string => path.replace(/\/+$/, '') || '/';

function isCurrent(pathname: string, href: string): boolean {
  const here = trim(pathname);
  const target = trim(href);
  return target === '/admin' ? here === target : here === target || here.startsWith(`${target}/`);
}

/** Frame of every panel page: skip link, header with the session control, the main navigation and `main#contenido`. */
export function AdminShell({ items, children }: { items: readonly NavItem[]; children: ReactNode }) {
  const pathname = usePathname() ?? '';
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#contenido">
        {UI.shell.skip}
      </a>
      <header className={styles.header}>
        <p className={`${styles.brand} display`}>{UI.shell.brand}</p>
        <nav className={styles.nav} aria-label={UI.shell.navLabel}>
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.href}>
                <Link className={styles.link} href={item.href} {...(isCurrent(pathname, item.href) ? { 'aria-current': 'page' as const } : {})}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <LogoutButton />
      </header>
      <main id="contenido" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
