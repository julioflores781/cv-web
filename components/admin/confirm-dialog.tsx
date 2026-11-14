'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import form from './form.module.css';
import styles from './confirm-dialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in a sentence: it is the accessible description of the dialog. */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A native modal `<dialog>`: focus starts on «Cancelar», Esc cancels and the focus goes back to what opened it. */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancelar', onConfirm, onCancel }: ConfirmDialogProps) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // jsdom has no modal dialog; the attribute fallback keeps the component testable.
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
      cancel.current?.focus();
      return;
    }
    if (element.hasAttribute('open')) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
      opener.current?.focus();
    }
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  };

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-text`} onKeyDown={onKeyDown} onCancel={(event) => {
      event.preventDefault();
      onCancel();
    }}>
      {open ? (
        <div className={styles.body}>
          <h2 id={`${uid}-title`} className={styles.title}>
            {title}
          </h2>
          <p id={`${uid}-text`}>{description}</p>
          <div className={styles.actions}>
            <button ref={cancel} type="button" className={form.secondary} onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="button" className={form.button} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
