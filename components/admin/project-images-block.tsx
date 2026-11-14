'use client';

import { useEffect, useRef, useState } from 'react';
import type { ContentLang, UploadedImage } from '@/lib/api/admin';
import { updatePair } from '@/lib/admin/content/model';
import { canHaveImages, withImage, withImageMoved, withoutImage, type ProjectPair, type ProjectsDraft } from '@/lib/admin/content/projects';
import { LIMITS } from '@/lib/admin/content/validate';
import { shortKey, type ImageLibrary, type UploadedPreview } from '@/lib/admin/images';
import { UI } from '@/lib/admin/messages';
import type { EditorContext } from './editor-frame';
import { ImageUploader } from './image-uploader';
import { FieldError, TextField } from './paired-field';
import form from './form.module.css';
import styles from './editor.module.css';
import own from './projects.module.css';
import pics from './images.module.css';

type Scope = 'common' | ContentLang;

const B = UI.projects.imageBlock;
const FIELDS = { ...UI.editor.fields, ...UI.projects.fields };

export interface ProjectImagesBlockProps {
  pair: ProjectPair;
  context: EditorContext<ProjectsDraft>;
  blockId: string;
  fieldIdOf: (scope: Scope, field: string) => string;
  ctx: (scope: Scope) => string;
  /** Appended to the names of the buttons («(común · Proyecto 1: …)»). */
  contextText: string;
  /** The storage listing; absent when it was not read (no thumbnails, nothing flagged as missing). */
  library?: ImageLibrary | undefined;
  /** Images uploaded in this visit, by key. */
  uploads: ReadonlyMap<string, UploadedPreview>;
  onUploaded: (image: UploadedImage, file: File) => void;
  /** A local preview (`preview`, an object URL) failed: the editor revokes it. */
  onPreviewFailed: (key: string, preview: string) => void;
  /** Replaces the browser upload in tests. */
  upload?: Parameters<typeof ImageUploader>[0]['upload'];
}

const Warning = ({ id, text }: { id: string; text: string }) => (
  <p id={id} className={pics.warning}>
    <svg className={pics.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 2 18.5 17H1.5Z M10 7.5v4.5 M10 14.2v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
    <span>{text}</span>
  </p>
);

/**
 * Images of a project. The first one is the cover; each can be made the cover, moved up or down and taken out of the project (the file stays
 * in the storage), with its `alt` in Spanish and English (required, at most 200). Keys and sizes are read-only and identical in both
 * languages. Only own + public projects take images: otherwise the block says so and, if images are left, asks to remove them (saving fails
 * until then; they are never removed on their own). New images are uploaded here and stay pending until the document is saved.
 */
export function ProjectImagesBlock({ pair, context, blockId, fieldIdOf, ctx, contextText, library, uploads, onUploaded, onPreviewFailed, upload }: ProjectImagesBlockProps) {
  const { update, errors, expire } = context;
  const images = pair.common.images;
  const eligible = canHaveImages(pair.common);
  const blockError = errors.fields[blockId];
  const [notice, setNotice] = useState('');
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    if (focusNext.current === null) return;
    const target = document.getElementById(focusNext.current);
    focusNext.current = null;
    target?.focus();
  });

  const note = !eligible ? (images.length > 0 ? B.mustRemove : B.notAllowed) : images.length === 0 ? B.none : null;
  const unavailable = eligible && library?.kind === 'unavailable';
  const described = [note ? `${blockId}-note` : null, unavailable ? `${blockId}-storage` : null, blockError ? `${blockId}-error` : null].filter(Boolean).join(' ') || undefined;
  const stored = new Map(library?.kind === 'ok' ? library.images.map((image) => [image.key, image.url]) : []);

  const apply = (change: (item: ProjectPair) => ProjectPair, fieldId: string, reordered: readonly string[] = []) =>
    update((current) => ({ ...current, items: updatePair(current.items, pair.key, change) }), fieldId, reordered);
  /** The images' fields in every scope carry the position: a move or a removal takes their server marks off. */
  const rowLists = (['common', 'es', 'en'] as const).map((scope) => fieldIdOf(scope, 'images'));

  const setAlt = (lang: ContentLang, i: number, value: string) =>
    apply((item) => {
      const text = item[lang];
      if (text === null) return item;
      const alts = item.common.images.map((_, n) => (n === i ? value : (text.alts[n] ?? '')));
      return { ...item, [lang]: { ...text, alts } };
    }, fieldIdOf(lang, `images.${i}.alt`));

  const rowId = (i: number) => fieldIdOf('common', `images.${i}`);

  const move = (from: number, to: number) => {
    apply((item) => withImageMoved(item, from, to), blockId, rowLists);
    focusNext.current = rowId(to);
    setNotice(B.moved(from + 1, to + 1));
  };

  const remove = (i: number) => {
    apply((item) => withoutImage(item, i), blockId, rowLists);
    focusNext.current = blockId;
    setNotice(B.removed(i + 1));
  };

  const added = (image: UploadedImage, file: File) => {
    onUploaded(image, file);
    const index = images.length;
    apply((item) => withImage(item, { key: image.key, width: image.width, height: image.height }), blockId);
    const firstLang: ContentLang = pair.es !== null ? 'es' : 'en';
    focusNext.current = fieldIdOf(firstLang, `images.${index}.alt`);
    setNotice(B.added(index + 1));
  };

  const thumbnail = (key: string, i: number) => {
    const uploaded = uploads.get(key);
    const src = uploaded?.failed ? undefined : (uploaded?.preview ?? uploaded?.url ?? stored.get(key));
    if (src === undefined || broken.has(src)) {
      // A preview that failed (or a thumbnail that does not load) shows the image's text instead.
      const failed = uploaded?.failed === true || src !== undefined;
      if (!failed && library === undefined && uploaded === undefined) return null;
      return (
        <div className={pics.thumbMissing}>
          <span>{failed ? `${B.previewFailed} ${pair.es?.alts[i] ?? ''}`.trim() : B.thumbnail(i + 1)}</span>
        </div>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element -- thumbnails of the storage (or a local object URL); the site serves images unoptimised.
      <img
        className={pics.thumb}
        src={src}
        alt={pair.es?.alts[i]?.trim() || B.thumbnail(i + 1)}
        width={160}
        height={90}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          setBroken((current) => new Set(current).add(src));
          if (uploaded?.preview === src) onPreviewFailed(key, src);
        }}
      />
    );
  };

  return (
    <fieldset id={blockId} tabIndex={-1} className={own.group} data-invalid={blockError ? 'true' : undefined} aria-describedby={described}>
      <legend className={styles.legend}>{FIELDS.images}</legend>
      {note ? (
        !eligible && images.length > 0 ? (
          <Warning id={`${blockId}-note`} text={note} />
        ) : (
          <p id={`${blockId}-note`} className={own.note}>
            {note}
          </p>
        )
      ) : null}
      {unavailable ? (
        <p id={`${blockId}-storage`} className={own.note}>
          {B.unavailable}
          {library.reference ? <span className="mono"> {UI.referenceLabel}: {library.reference}</span> : null}
        </p>
      ) : null}
      {blockError ? <FieldError id={`${blockId}-error`} code={blockError} /> : null}
      {images.length > 0 ? (
        <ol className={own.rows}>
          {images.map((image, i) => {
            const id = rowId(i);
            const rowError = errors.fields[id];
            const missing = library?.kind === 'ok' && !stored.has(image.key) && !uploads.has(image.key);
            const name = (text: string) => `${text} ${contextText}`;
            return (
              <li key={`${i}-${image.key}`} className={own.row} id={id} tabIndex={-1} aria-describedby={[missing ? `${id}-missing` : null, rowError ? `${id}-error` : null].filter(Boolean).join(' ') || undefined}>
                <div className={pics.imageRow}>
                  {thumbnail(image.key, i)}
                  <div className={pics.imageBody}>
                    <p className={own.imageHead}>
                      <strong>{FIELDS.image(i + 1)}</strong>
                      {i === 0 ? <span className={own.cover}>{B.cover}</span> : null}
                      <span className={`${own.imageKey} mono`}>{shortKey(image.key)}</span>
                      <span>{B.size(image.width, image.height)}</span>
                    </p>
                    {missing ? <Warning id={`${id}-missing`} text={B.missing} /> : null}
                    {rowError ? <FieldError id={`${id}-error`} code={rowError} /> : null}
                  </div>
                </div>
                {eligible ? (
                  <div className={own.alts}>
                    {(['es', 'en'] as const).map((lang) =>
                      pair[lang] === null ? null : (
                        <TextField
                          key={lang}
                          id={fieldIdOf(lang, `images.${i}.alt`)}
                          label={`${FIELDS.alt(i + 1)} (${UI.editor.langShort[lang]})`}
                          value={pair[lang]?.alts[i] ?? ''}
                          max={200}
                          hint={B.altHint}
                          lang={lang}
                          error={errors.fields[fieldIdOf(lang, `images.${i}.alt`)]}
                          labelledBy={ctx(lang)}
                          onChange={(value) => setAlt(lang, i, value)}
                        />
                      ),
                    )}
                  </div>
                ) : null}
                <div className={own.rowTools}>
                  {eligible && i > 0 ? (
                    <>
                      <button type="button" className={form.secondary} aria-label={name(B.makeCover(i + 1))} onClick={() => move(i, 0)}>
                        {B.makeCover(i + 1)}
                      </button>
                      <button type="button" className={form.secondary} aria-label={name(B.up(i + 1))} onClick={() => move(i, i - 1)}>
                        {B.up(i + 1)}
                      </button>
                    </>
                  ) : null}
                  {eligible && i < images.length - 1 ? (
                    <button type="button" className={form.secondary} aria-label={name(B.down(i + 1))} onClick={() => move(i, i + 1)}>
                      {B.down(i + 1)}
                    </button>
                  ) : null}
                  <button type="button" className={form.secondary} aria-label={name(B.remove(i + 1))} onClick={() => remove(i)}>
                    {B.remove(i + 1)}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {eligible ? (
        <ImageUploader
          id={`${blockId}-upload`}
          remaining={Math.max(0, LIMITS.images - images.length)}
          context={contextText}
          onUploaded={added}
          onExpired={expire}
          {...(upload ? { upload } : {})}
        />
      ) : null}
      <p role="status" className={styles.visuallyHidden}>
        {notice}
      </p>
    </fieldset>
  );
}
