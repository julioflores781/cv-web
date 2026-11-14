import type { Metadata } from 'next';
import { PasswordForm } from '@/components/admin/password-form';
import { SessionActions } from '@/components/admin/session-actions';
import { UI } from '@/lib/admin/messages';

export const metadata: Metadata = { title: UI.settings.title };

export default function SettingsPage() {
  return (
    <>
      <h1 className="display" style={{ fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 1 }}>
        {UI.settings.title}
      </h1>
      <section aria-labelledby="password-title" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 id="password-title">{UI.passwordChange.title}</h2>
        <PasswordForm />
      </section>
      <section aria-labelledby="sessions-title" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 id="sessions-title">{UI.session.title}</h2>
        <SessionActions />
      </section>
    </>
  );
}
