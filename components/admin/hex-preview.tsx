'use client';

import { useMemo, useState } from 'react';
import type { ContentLang } from '@/lib/api/admin';
import { toArchitecture, type ArchitectureDraft } from '@/lib/admin/content/architecture';
import { UI } from '@/lib/admin/messages';
import { buildHexModel } from '@/lib/architecture/model';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { buildHexPlane } from '../hex-plane-section';
import form from './form.module.css';
import styles from './architecture.module.css';
import editor from './editor.module.css';

const LANGS: readonly ContentLang[] = ['es', 'en'];
const TEXT = UI.architecture.preview;

/**
 * Live preview of the hexagon: the same `buildHexPlane` (`buildHexModel` + `HexPlane`, with the public dictionary) the site renders, fed with
 * one language of the draft, inside a `data-mode="profile"` box. The API ids never reach it (`buildHexModel` drops them).
 */
export function HexPreview({ draft }: { draft: ArchitectureDraft }) {
  const [lang, setLang] = useState<ContentLang>('es');
  const architecture = useMemo(() => toArchitecture(draft, lang), [draft, lang]);
  const drawable = useMemo(() => buildHexModel(architecture) !== null, [architecture]);
  return (
    <section className={editor.panel} aria-labelledby="vista-previa-titulo">
      <h2 id="vista-previa-titulo" className={editor.panelTitle}>
        {TEXT.title}
      </h2>
      <p className={editor.intro}>{TEXT.intro}</p>
      <div role="group" aria-label={TEXT.langs} className={editor.actions}>
        {LANGS.map((value) => (
          <button key={value} type="button" className={`${form.secondary} ${styles.langButton}`} aria-pressed={value === lang} onClick={() => setLang(value)}>
            {UI.editor.langs[value]}
          </button>
        ))}
      </div>
      {/* Keyed by language so the plane starts again on its first port, as a fresh page would. */}
      <div key={lang} className={styles.preview} data-mode="profile" data-preview lang={lang}>
        {drawable ? null : (
          <p className={styles.previewNote} lang="es">
            {TEXT.empty}
          </p>
        )}
        {buildHexPlane(architecture, getDictionary(lang))}
      </div>
    </section>
  );
}
