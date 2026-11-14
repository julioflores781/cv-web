import type { Metadata } from 'next';
import { LoginForm } from '@/components/admin/login-form';
import { UI } from '@/lib/admin/messages';
import styles from '@/components/admin/notice.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: UI.login.title };

interface LoginPageProps {
  searchParams: Promise<{ expired?: string | string[]; next?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { expired, next } = await searchParams;
  return (
    <main className={styles.page}>
      <h1 className={`${styles.title} display`}>{UI.login.title}</h1>
      <LoginForm expired={expired === '1'} next={typeof next === 'string' ? next : null} />
    </main>
  );
}
