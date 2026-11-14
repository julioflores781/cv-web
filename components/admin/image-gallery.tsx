'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { StoredImage } from '@/lib/api/admin';
import { adminFetch } from '@/lib/admin/browser-client';
import { formatBytes } from '@/lib/admin/format';
import { imageIdOf, shortKey } from '@/lib/admin/images';
import { expiredLoginUrl } from '@/lib/admin/next-path';
import { adminMessage, CLIENT_FAILURES, UI } from '@/lib/admin/messages';
import { CleanupPanel } from './cleanup-panel';
import { ConfirmDialog } from './confirm-dialog';
import { LocalTime } from './local-time';
import { StatusBanner } from './status-banner';
import form from './form.module.css';
import styles from './editor.module.css';
import pics from './images.module.css';

const T = UI.images;
const PATH = '/admin/images/';

type Use = 'current' | 'old' | 'unused';

interface ImageGalleryProps {
  images: StoredImage[];
  /** Keys used by the published projects; `null` when they could not be read (then «in use» is not split into current and old). */
  currentKeys: readonly string[] | null;
  navigate?: (url: string) => void;
}

const goTo = (url: string) => window.location.assign(url);

const usageOf = (image: StoredImage, current: ReadonlySet<string> | null): Use => (!image.referenced ? 'unused' : current === null || current.has(image.key) ? 'current' : 'old');

function UseBadge({ use, id }: { use: Use; id: string }) {
  const label = use === 'unused' ? T.unused : use === 'old' ? T.inUseOld : T.inUse;
  return (
    <span className={pics.badge} data-use={use} id={id}>
      {/* The state is said in words; the shape only repeats it (filled = in use, ring = old version, dash = unused). */}
      <svg className={pics.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {use === 'current' ? <circle cx="10" cy="10" r="6" fill="currentColor" /> : null}
        {use === 'old' ? <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {use === 'unused' ? <path d="M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
      </svg>
      {label}
    </span>
  );
}

/**
 * Every stored image with its size, upload date and whether it is in use (by the published content or only by an old version). Deleting asks
 * for confirmation; a 409 explains that some version, maybe an old one, still uses it. The orphan cleanup sits below.
 */
export function ImageGallery({ images: initial, currentKeys, navigate = goTo }: ImageGalleryProps) {
  const uid = useId();
  const [images, setImages] = useState(initial);
  const [deleting, setDeleting] = useState<StoredImage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ key: string; text: string; reference?: string | undefined } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const focusNext = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = currentKeys === null ? null : new Set(currentKeys);

  useEffect(() => {
    if (focusNext.current === null) return;
    const target = focusNext.current === 'heading' ? heading.current : document.getElementById(focusNext.current);
    focusNext.current = null;
    target?.focus();
  });

  const buttonId = (key: string) => `${uid}-del-${imageIdOf(key) ?? 'x'}`;

  /** Drops rows and sends the focus to the next row's delete button (or the previous one, or the title when none is left). */
  const drop = (keys: readonly string[], focus: boolean) => {
    const gone = new Set(keys);
    const index = images.findIndex((image) => gone.has(image.key));
    const left = images.filter((image) => !gone.has(image.key));
    setImages(left);
    if (!focus) return;
    const next = left[Math.min(Math.max(index, 0), left.length - 1)];
    focusNext.current = next ? buttonId(next.key) : 'heading';
  };

  async function confirmDelete() {
    const image = deleting;
    setDeleting(null);
    if (image === null) return;
    const id = imageIdOf(image.key);
    const name = shortKey(image.key);
    if (id === null) return;
    setRowError(null);
    setBusy(image.key);
    const result = await adminFetch(`/admin/api/images/${id}`, { method: 'DELETE', timeoutMs: 20_000 });
    setBusy(null);
    if (result.kind === 'ok') {
      drop([image.key], true);
      setAnnouncement(T.removed(name));
      return;
    }
    if (result.kind === 'expired') {
      navigate(expiredLoginUrl(PATH));
      return;
    }
    if (result.kind === 'problem' && result.status === 404) {
      drop([image.key], true);
      setAnnouncement(T.removedMissing(name));
      return;
    }
    const text = result.kind === 'problem' ? (result.status === 409 ? T.inUseError : adminMessage(result.code)) : CLIENT_FAILURES[result.kind];
    setRowError({ key: image.key, text, reference: result.kind === 'problem' ? result.requestId : undefined });
  }

  return (
    <>
      <section aria-labelledby={`${uid}-title`}>
        <h2 id={`${uid}-title`} ref={heading} tabIndex={-1} className={styles.panelTitle}>
          {T.listTitle} <span className={pics.badge}>({T.count(images.length)})</span>
        </h2>
        {images.length === 0 ? (
          <p className={styles.empty}>{T.empty}</p>
        ) : (
          <ul className={pics.gallery}>
            {images.map((image) => {
              const name = shortKey(image.key);
              const use = usageOf(image, current);
              const error = rowError?.key === image.key ? rowError : null;
              return (
                <li key={image.key} className={pics.card}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails straight from the bucket; the site serves images unoptimised. */}
                  <img className={pics.thumb} src={image.url} alt={T.thumbnail(name)} width={160} height={90} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  <p className="mono">{name}</p>
                  <dl className={pics.facts}>
                    <dt>{T.size}</dt>
                    <dd>{formatBytes(image.bytes)}</dd>
                    <dt>{T.date}</dt>
                    <dd>
                      <LocalTime value={image.lastModified} />
                    </dd>
                    <dt>{T.status}</dt>
                    <dd>
                      <UseBadge use={use} id={`${buttonId(image.key)}-use`} />
                    </dd>
                  </dl>
                  {use === 'old' ? <p className={pics.hint}>{T.inUseOldHint}</p> : null}
                  {error ? (
                    <StatusBanner tone="error" role="alert" reference={error.reference}>
                      {error.text}
                    </StatusBanner>
                  ) : null}
                  <button
                    type="button"
                    id={buttonId(image.key)}
                    className={form.secondary}
                    aria-describedby={`${buttonId(image.key)}-use`}
                    aria-disabled={busy !== null ? 'true' : undefined}
                    onClick={() => busy === null && setDeleting(image)}
                  >
                    {busy === image.key ? T.removing : T.remove(name)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p role="status" className={styles.visuallyHidden}>
          {announcement}
        </p>
      </section>
      {initial.length > 0 ? <CleanupPanel onDeleted={(keys) => drop(keys, false)} onExpired={() => navigate(expiredLoginUrl(PATH))} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        title={T.removeTitle}
        description={deleting ? T.removeText(shortKey(deleting.key)) : ''}
        confirmLabel={T.removeConfirm}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
