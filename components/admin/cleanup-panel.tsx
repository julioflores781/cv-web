'use client';

import { useId, useState } from 'react';
import { adminFetch } from '@/lib/admin/browser-client';
import { parseCleanup } from '@/lib/admin/images';
import { adminMessage, CLIENT_FAILURES, UI } from '@/lib/admin/messages';
import { ConfirmDialog } from './confirm-dialog';
import { FieldError } from './paired-field';
import { StatusBanner } from './status-banner';
import form from './form.module.css';
import pics from './images.module.css';

const T = UI.images.cleanup;

interface Simulation {
  hours: number;
  wouldDelete: number;
  kept: number;
}

interface CleanupPanelProps {
  /** Keys that were really deleted, so the gallery drops them. */
  onDeleted: (keys: string[]) => void;
  /** The session died: back to the login. */
  onExpired: () => void;
}

const DEFAULT_HOURS = '24';
const hoursOf = (text: string): number | null => (/^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 24 * 365 ? Number(text) : null);

/**
 * Orphan cleanup in two steps: «Simular» (a dry run) shows what would go and what stays; «Borrar N» is enabled only after a simulation that
 * still matches the hours typed, with N > 0, and asks for confirmation. Changing the hours voids the simulation.
 */
export function CleanupPanel({ onDeleted, onExpired }: CleanupPanelProps) {
  const uid = useId();
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [invalid, setInvalid] = useState(false);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [busy, setBusy] = useState<'simulate' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState('');
  const [failure, setFailure] = useState<{ text: string; reference?: string | undefined } | null>(null);

  const parsed = hoursOf(hours);
  const current = simulation !== null && parsed === simulation.hours ? simulation : null;
  const stale = simulation !== null && current === null;

  async function call(dryRun: boolean, olderThanHours: number) {
    setFailure(null);
    setResult('');
    setBusy(dryRun ? 'simulate' : 'delete');
    const answer = await adminFetch('/admin/api/images/cleanup/', { json: { dryRun, olderThanHours }, timeoutMs: 30_000 });
    setBusy(null);
    if (answer.kind === 'expired') {
      onExpired();
      return null;
    }
    if (answer.kind !== 'ok') {
      setFailure(answer.kind === 'problem' ? { text: adminMessage(answer.code), reference: answer.requestId } : { text: CLIENT_FAILURES[answer.kind] });
      return null;
    }
    const report = parseCleanup(answer.data);
    if (report === null) setFailure({ text: adminMessage('ADMIN_BAD_RESPONSE') });
    return report;
  }

  async function simulate() {
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setSimulation(null);
    const report = await call(true, parsed);
    if (report === null) return;
    setSimulation({ hours: parsed, wouldDelete: report.wouldDelete.length, kept: report.kept });
    setResult(report.wouldDelete.length === 0 ? T.nothing : T.result(report.wouldDelete.length, report.kept));
  }

  async function run() {
    setConfirming(false);
    if (current === null) return;
    const report = await call(false, current.hours);
    setSimulation(null);
    if (report === null) return;
    onDeleted(report.deleted);
    setResult(report.deleted.length === 0 ? T.nothing : T.done(report.deleted.length));
  }

  return (
    <section className={pics.cleanup} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`}>{T.title}</h2>
      <p>{T.intro}</p>
      <div className={pics.actions}>
        <div className={form.group}>
          <label className={form.label} htmlFor={`${uid}-hours`}>
            {T.hours}
          </label>
          <input
            id={`${uid}-hours`}
            className={form.field}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={hours}
            aria-invalid={invalid ? 'true' : undefined}
            aria-describedby={`${uid}-hint${invalid ? ` ${uid}-error` : ''}`}
            onChange={(event) => {
              setHours(event.currentTarget.value);
              setInvalid(false);
            }}
          />
          <span id={`${uid}-hint`} className={form.hint}>
            {T.hoursHint}
          </span>
          {invalid ? <FieldError id={`${uid}-error`} text={T.hoursError} /> : null}
        </div>
        <button type="button" className={form.secondary} aria-disabled={busy !== null ? 'true' : undefined} onClick={() => busy === null && void simulate()}>
          {busy === 'simulate' ? T.simulating : T.simulate}
        </button>
        <button
          type="button"
          className={form.button}
          disabled={current === null || current.wouldDelete === 0 || busy !== null}
          onClick={() => setConfirming(true)}
        >
          {busy === 'delete' ? T.running : T.run(current?.wouldDelete ?? simulation?.wouldDelete ?? 0)}
        </button>
      </div>
      <p role="status">{stale ? T.stale : result}</p>
      {failure ? (
        <StatusBanner tone="error" role="alert" reference={failure.reference}>
          {failure.text}
        </StatusBanner>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={T.confirmTitle}
        description={T.confirmText(current?.wouldDelete ?? 0, current?.hours ?? 0)}
        confirmLabel={T.confirm}
        onConfirm={() => void run()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
