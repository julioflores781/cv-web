'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { UI } from '@/lib/admin/messages';
import { ConfirmDialog } from './confirm-dialog';
import form from './form.module.css';
import styles from './editor.module.css';

interface ListItem {
  key: string;
  saved: boolean;
}

interface ItemListProps<P extends ListItem> {
  items: readonly P[];
  max: number;
  addLabel: string;
  emptyText: string;
  limitText: string;
  /** Visible name of an item (its title, else its id). */
  label: (item: P, index: number) => string;
  /** Shown next to the title in the header (the id). */
  detail: (item: P) => string;
  /** Removing an item with content (or an already published one) asks first. */
  hasContent: (item: P) => boolean;
  /** Text of that confirmation; the generic «se quitará en español y en inglés» when not given. */
  removeText?: (item: P, label: string) => string;
  /** Errors of the last failed save in each item (badge, and the item opens). */
  errorCount: (key: string) => number;
  /** Changes after each failed save: items with errors open again. */
  reveal: number;
  /** Adds an item and returns its key, so the focus can go to its first field. */
  onAdd: () => string;
  onRemove: (key: string) => void;
  onMove: (key: string, delta: number) => void;
  children: (item: P, index: number) => ReactNode;
}

type Focus = { key: string; target: 'first-field' | 'toggle' | 'up' | 'down' } | { key: null; target: 'add' };

interface AccordionProps {
  id: string;
  itemKey: string;
  title: string;
  detail: string;
  errors: number;
  reveal: number;
  defaultOpen: boolean;
  tools: ReactNode;
  children: ReactNode;
}

/** One item: a header button with `aria-expanded` (title, id and the error badge), its tools and the body it shows or hides. */
function ItemAccordion({ id, itemKey, title, detail, errors, reveal, defaultOpen, tools, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [seen, setSeen] = useState(reveal);
  // After a failed save, the items with errors open (adjusting state while rendering, not in an effect).
  if (seen !== reveal) {
    setSeen(reveal);
    if (errors > 0 && !open) setOpen(true);
  }
  return (
    <li className={styles.item} data-item={itemKey} data-errors={errors > 0 ? 'true' : undefined}>
      <div className={styles.itemHead}>
        <button type="button" className={styles.toggle} id={`${id}-toggle`} aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
          <span className={styles.itemTitle}>{title}</span>
          {detail ? <span className={`${styles.itemId} mono`}>{detail}</span> : null}
          {errors > 0 ? (
            <span className={styles.badge}>
              <svg className={styles.errorIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M10 2 18.5 17H1.5Z M10 7.5v4.5 M10 14.2v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              {UI.editor.errorBadge(errors)}
            </span>
          ) : null}
          <span className={styles.visuallyHidden}>{open ? UI.editor.collapse : UI.editor.expand}</span>
        </button>
        <div className={styles.tools}>{tools}</div>
      </div>
      <div id={`${id}-body`} className={styles.itemBody} hidden={!open}>
        {children}
      </div>
    </li>
  );
}

/**
 * Items of an editor: add (focus to the first field of the new one), remove (asks when it has content or was published; focus to the neighbour),
 * move up and down (labelled with the title and the position, inert at the ends, the focus stays and the new position is announced). The cap disables «add».
 */
export function ItemList<P extends ListItem>(props: ItemListProps<P>) {
  const { items, max, addLabel, emptyText, limitText, label, detail, hasContent, removeText, errorCount, reveal, onAdd, onRemove, onMove, children } = props;
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const focus = useRef<Focus | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [removing, setRemoving] = useState<P | null>(null);
  const full = items.length >= max;

  useEffect(() => {
    const wanted = focus.current;
    const container = root.current;
    if (!wanted || !container) return;
    focus.current = null;
    if (wanted.key === null) {
      container.querySelector<HTMLElement>('[data-add]')?.focus();
      return;
    }
    const item = container.querySelector<HTMLElement>(`[data-item="${wanted.key}"]`);
    const target =
      wanted.target === 'first-field'
        ? item?.querySelector<HTMLElement>('input:not([readonly]), textarea, select')
        : item?.querySelector<HTMLElement>(wanted.target === 'toggle' ? `[id$="-toggle"]` : `[data-move="${wanted.target}"]`);
    target?.focus();
  });

  const add = () => {
    if (full) return;
    const key = onAdd();
    focus.current = { key, target: 'first-field' };
  };

  const move = (item: P, index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    onMove(item.key, delta);
    focus.current = { key: item.key, target: delta < 0 ? 'up' : 'down' };
    setAnnouncement(UI.editor.moved(label(item, index), to + 1, items.length));
  };

  const remove = (item: P) => {
    const index = items.findIndex((candidate) => candidate.key === item.key);
    const neighbour = items[index + 1] ?? items[index - 1];
    onRemove(item.key);
    focus.current = neighbour ? { key: neighbour.key, target: 'toggle' } : { key: null, target: 'add' };
  };

  const askRemove = (item: P) => {
    if (item.saved || hasContent(item)) setRemoving(item);
    else remove(item);
  };

  const addButton = (
    <button type="button" data-add className={`${form.button} ${styles.add}`} aria-disabled={full ? true : undefined} aria-describedby={full ? `${uid}-limit` : undefined} onClick={add}>
      {addLabel}
    </button>
  );

  return (
    <div ref={root} className={styles.frame}>
      {items.length === 0 ? (
        <div className={styles.empty}>
          <p>{emptyText}</p>
          {addButton}
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((item, index) => {
              const name = label(item, index);
              return (
                <ItemAccordion
                    key={item.key}
                    id={`${uid}-${item.key}`}
                    itemKey={item.key}
                    title={name}
                    detail={detail(item)}
                    errors={errorCount(item.key)}
                    reveal={reveal}
                    defaultOpen={!item.saved}
                    tools={
                      <>
                        <button type="button" data-move="up" className={styles.tool} aria-label={UI.editor.moveUp(name, index + 1)} aria-disabled={index === 0 ? true : undefined} onClick={() => move(item, index, -1)}>
                          ↑
                        </button>
                        <button
                          type="button"
                          data-move="down"
                          className={styles.tool}
                          aria-label={UI.editor.moveDown(name, index + 1)}
                          aria-disabled={index === items.length - 1 ? true : undefined}
                          onClick={() => move(item, index, 1)}
                        >
                          ↓
                        </button>
                        <button type="button" className={styles.tool} aria-label={UI.editor.remove(name, index + 1)} onClick={() => askRemove(item)}>
                          ✕
                        </button>
                      </>
                    }
                  >
                    {children(item, index)}
                  </ItemAccordion>
              );
            })}
          </ul>
          {addButton}
        </>
      )}
      {full ? (
        <p id={`${uid}-limit`} className={styles.intro}>
          {limitText}
        </p>
      ) : null}
      <p role="status" className={styles.visuallyHidden}>
        {announcement}
      </p>
      <ConfirmDialog
        open={removing !== null}
        title={UI.editor.removeTitle}
        description={removing ? (removeText ?? ((_item: P, name: string) => UI.editor.removeText(name)))(removing, label(removing, items.indexOf(removing))) : ''}
        confirmLabel={UI.editor.removeConfirm}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const item = removing;
          setRemoving(null);
          if (item) remove(item);
        }}
      />
    </div>
  );
}
