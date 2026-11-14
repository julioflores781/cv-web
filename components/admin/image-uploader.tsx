'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { UploadedImage } from '@/lib/api/admin';
import { uploadImage, type AbortableResult } from '@/lib/admin/browser-client';
import { checkImageFile, IMAGE_ACCEPT, parseUploaded } from '@/lib/admin/images';
import { adminMessage, CLIENT_FAILURES, UI } from '@/lib/admin/messages';
import form from './form.module.css';
import styles from './images.module.css';

const T = UI.uploader;

type Upload = (file: File, signal: AbortSignal) => Promise<AbortableResult<unknown>>;

interface Entry {
  id: number;
  name: string;
  state: 'queued' | 'uploading' | 'done' | 'rejected' | 'failed' | 'cancelled';
  /** Why it was rejected or failed (Spanish), with the request id when the server gave one. */
  reason?: string | undefined;
  reference?: string | undefined;
}

interface ImageUploaderProps {
  id: string;
  /** Free slots of the project (10 minus its images); files beyond them are rejected before any request. */
  remaining: number;
  /** Appended to the name of the button («(común · Proyecto 1: …)»), so each project's uploader reads apart. */
  context: string;
  onUploaded: (image: UploadedImage, file: File) => void;
  /** The session died during an upload: the editor keeps the draft and goes to the login. */
  onExpired: () => void;
  /** Replaces the browser call in tests. */
  upload?: Upload;
}

const defaultUpload: Upload = (file, signal) => uploadImage(file, { signal });

function failureOf(result: Exclude<AbortableResult<unknown>, { kind: 'ok' } | { kind: 'expired' } | { kind: 'aborted' }>): Pick<Entry, 'reason' | 'reference'> {
  if (result.kind === 'problem') return { reason: adminMessage(result.code), reference: result.requestId };
  return { reason: CLIENT_FAILURES[result.kind] };
}

/**
 * Drop zone and file button (keyboard path) for a project's images. Each file is checked first in the browser (magic bytes, 5 MiB, free slots):
 * a rejected file is listed with its reason and never sent. The accepted ones go one at a time, never retried, each with its own state.
 */
export function ImageUploader({ id, remaining, context, onUploaded, onExpired, upload = defaultUpload }: ImageUploaderProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef<Array<{ entry: number; file: File }>>([]);
  const running = useRef(false);
  const nextId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  /** Slots already promised to files waiting in the queue. */
  const promised = useRef(0);
  const callbacks = useRef({ onUploaded, onExpired, upload });
  useEffect(() => {
    callbacks.current = { onUploaded, onExpired, upload };
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  const patch = (entryId: number, change: Partial<Entry>) => setEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, ...change } : entry)));

  async function drain() {
    if (running.current) return;
    running.current = true;
    let done = 0;
    let failed = 0;
    while (queue.current.length > 0 && alive.current) {
      const job = queue.current.shift() as { entry: number; file: File };
      patch(job.entry, { state: 'uploading' });
      const abort = new AbortController();
      controller.current = abort;
      const result = await callbacks.current.upload(job.file, abort.signal);
      controller.current = null;
      promised.current = Math.max(0, promised.current - 1);
      if (!alive.current) break;
      if (result.kind === 'ok') {
        const image = parseUploaded(result.data);
        if (image === null) {
          failed += 1;
          patch(job.entry, { state: 'failed', reason: adminMessage('ADMIN_BAD_RESPONSE') });
          continue;
        }
        done += 1;
        patch(job.entry, { state: 'done' });
        callbacks.current.onUploaded(image, job.file);
        continue;
      }
      if (result.kind === 'expired') {
        for (const rest of queue.current) patch(rest.entry, { state: 'cancelled' });
        queue.current = [];
        promised.current = 0;
        patch(job.entry, { state: 'cancelled' });
        running.current = false;
        callbacks.current.onExpired();
        return;
      }
      failed += 1;
      patch(job.entry, result.kind === 'aborted' ? { state: 'cancelled' } : { state: 'failed', ...failureOf(result) });
    }
    running.current = false;
    if (alive.current && done + failed > 0) setAnnouncement(T.summary(done, failed));
  }

  async function accept(files: readonly File[]) {
    if (files.length === 0) return;
    setAnnouncement(T.selected(files.length));
    const checks = await Promise.all(files.map((file) => checkImageFile(file)));
    if (!alive.current) return;
    const added: Entry[] = [];
    files.forEach((file, i) => {
      const entryId = (nextId.current += 1);
      const check = checks[i];
      if (check === undefined || !check.ok) {
        added.push({ id: entryId, name: file.name, state: 'rejected', reason: T.reasons[check?.reason ?? 'type'] });
        return;
      }
      if (promised.current >= remaining) {
        added.push({ id: entryId, name: file.name, state: 'rejected', reason: T.reasons.full });
        return;
      }
      promised.current += 1;
      queue.current.push({ entry: entryId, file });
      added.push({ id: entryId, name: file.name, state: 'queued' });
    });
    setEntries((current) => [...current, ...added]);
    void drain();
  }

  const full = remaining <= 0;
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (full) return;
    void accept(Array.from(event.dataTransfer?.files ?? []));
  };

  return (
    <div className={styles.uploader}>
      <div
        className={styles.drop}
        data-dragging={dragging ? 'true' : undefined}
        aria-disabled={full ? 'true' : undefined}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {/* The state of the drop zone is also said in words (and a dashed, thicker border), never by colour alone. */}
        <p className={styles.dropText}>{dragging ? T.dropActive : T.drop}</p>
        <p className={styles.dropText}>{T.or}</p>
        <button
          type="button"
          className={form.secondary}
          aria-label={`${T.choose} ${context}`}
          aria-describedby={`${id}-hint`}
          aria-disabled={full ? 'true' : undefined}
          onClick={() => {
            if (!full) input.current?.click();
          }}
        >
          {T.choose}
        </button>
        <input
          ref={input}
          id={`${id}-input`}
          className={styles.fileInput}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          tabIndex={-1}
          aria-hidden="true"
          disabled={full}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void accept(files);
          }}
        />
        <p id={`${id}-hint`} className={styles.hint}>
          {full ? UI.projects.imageBlock.full(10) : T.hint(remaining)}
        </p>
      </div>
      {entries.length > 0 ? (
        <ul className={styles.queue} aria-label={`${T.queue} ${context}`}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.queueItem} data-state={entry.state}>
              {entry.state === 'rejected' || entry.state === 'failed' ? (
                <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M10 2 18.5 17H1.5Z M10 7.5v4.5 M10 14.2v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              ) : null}
              <span className={styles.fileName}>{entry.name}</span>
              <span>
                <strong>{T.states[entry.state]}</strong>
                {entry.reason ? `: ${entry.reason}` : null}
                {entry.reference ? (
                  <span className="mono">
                    {' '}
                    {UI.referenceLabel}: {entry.reference}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" className={styles.visuallyHidden}>
        {announcement}
      </p>
    </div>
  );
}
