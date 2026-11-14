'use client';

import type { ContentDiff, DocumentDiff } from '@/lib/admin/content/diff';
import { isEmptyDiff } from '@/lib/admin/content/diff';
import { UI } from '@/lib/admin/messages';
import styles from './editor.module.css';

/** What changed in one language: ids added, removed and modified (with the Spanish names of the fields), and whether the order changed. */
export function DocumentDiffList({ side, label }: { side: DocumentDiff; label: (field: string) => string }) {
  if (isEmptyDiff(side)) return <p>{UI.editor.diff.none}</p>;
  return (
    <ul className={styles.summaryList}>
      {side.added.length > 0 ? <li>{`${UI.editor.diff.added}: ${side.added.join(', ')}`}</li> : null}
      {side.removed.length > 0 ? <li>{`${UI.editor.diff.removed}: ${side.removed.join(', ')}`}</li> : null}
      {side.modified.length > 0 ? (
        <li>{`${UI.editor.diff.modified}: ${side.modified.map((item) => `${item.id} (${item.fields.map(label).join(', ')})`).join('; ')}`}</li>
      ) : null}
      {side.reordered ? <li>{UI.editor.diff.reordered}</li> : null}
    </ul>
  );
}

/** What changed between two versions, per language. */
export function ContentDiffList({ diff, label }: { diff: ContentDiff; label: (field: string) => string }) {
  return (
    <div className={styles.diff}>
      {(['es', 'en'] as const).map((lang) => (
        <section key={lang} aria-label={UI.editor.langs[lang]}>
          <p>
            <strong>{UI.editor.langs[lang]}</strong>
          </p>
          <DocumentDiffList side={diff[lang]} label={label} />
        </section>
      ))}
    </div>
  );
}
