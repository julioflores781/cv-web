'use client';

import { useRef, useState } from 'react';
import { adminFetch } from '@/lib/admin/browser-client';
import { ADMIN_MESSAGES, CLIENT_FAILURES, GENERIC_MESSAGE, UI } from '@/lib/admin/messages';
import { ConfirmDialog } from './confirm-dialog';
import { StatusBanner } from './status-banner';
import form from './form.module.css';
import styles from './session-actions.module.css';

interface ActionProps {
  navigate?: (url: string) => void;
}

const goTo = (url: string): void => window.location.assign(url);
const LOGIN = '/admin/login/';

type Failure = { text: string; reference?: string | undefined };

function failureOf(result: Awaited<ReturnType<typeof adminFetch>>): Failure | null {
  switch (result.kind) {
    case 'ok':
    case 'expired':
      return null;
    case 'problem':
      return { text: ADMIN_MESSAGES[result.code] ?? GENERIC_MESSAGE, reference: result.requestId };
    default:
      return { text: CLIENT_FAILURES[result.kind] };
  }
}

/** Runs one session call; a dead session counts as done (the goal was to leave) and goes to the login. */
function useSessionCall(path: string, navigate: (url: string) => void) {
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const run = async () => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setFailure(null);
    const result = await adminFetch(path, { method: 'POST', json: {} });
    busy.current = false;
    setWorking(false);
    const failed = failureOf(result);
    if (failed) setFailure(failed);
    else navigate(LOGIN);
  };
  return { run, working, failure };
}

/** «Cerrar sesión»: deletes this browser's cookie. If the request fails the session stays open and the error is shown. */
export function LogoutButton({ navigate = goTo }: ActionProps) {
  const { run, working, failure } = useSessionCall('/admin/api/logout/', navigate);
  return (
    <div className={styles.logout}>
      <button type="button" className={styles.logoutButton} aria-disabled={working ? true : undefined} onClick={() => void run()}>
        {working ? UI.shell.loggingOut : UI.shell.logout}
      </button>
      {failure ? (
        <StatusBanner tone="error" role="alert" reference={failure.reference}>
          {failure.text}
        </StatusBanner>
      ) : null}
    </div>
  );
}

/** What «Cerrar sesión» does and does not do, plus «Cerrar todas las sesiones» behind a confirmation. */
export function SessionActions({ navigate = goTo }: ActionProps) {
  const [asking, setAsking] = useState(false);
  const { run, working, failure } = useSessionCall('/admin/api/logout-all/', navigate);
  return (
    <div className={styles.actions}>
      <p>{UI.session.note}</p>
      {failure ? (
        <StatusBanner tone="error" role="alert" reference={failure.reference}>
          {failure.text}
        </StatusBanner>
      ) : null}
      <div>
        <button type="button" className={form.secondary} aria-disabled={working ? true : undefined} onClick={() => setAsking(true)}>
          {working ? UI.session.working : UI.session.allButton}
        </button>
      </div>
      <ConfirmDialog
        open={asking}
        title={UI.session.allTitle}
        description={UI.session.allDescription}
        confirmLabel={UI.session.allConfirm}
        cancelLabel={UI.session.cancel}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          void run();
        }}
      />
    </div>
  );
}
