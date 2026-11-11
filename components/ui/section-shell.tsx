import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface SectionShellProps {
  id?: string;
  /** Id of the section's h2: names the region. */
  labelledBy: string;
  /** Alternate background (`--bg2`). */
  alt?: boolean;
  /** Drops the bottom border (the last section, followed by the footer's own border). */
  last?: boolean;
  /** Parity-probe key; defaults to `section` / `section-alt`. */
  probe?: string;
  /** Column layout (head row above the content) with this gap in px, as in the services, process and projects sections. */
  stack?: 40 | 48;
  children: ReactNode;
}

/** The one section frame: 1280px container, 96px/24px padding, bottom border and optional alternate background. */
export function SectionShell({ id, labelledBy, alt = false, last = false, probe, stack, children }: SectionShellProps) {
  const className = [styles.shell, alt ? styles.alt : '', last ? styles.last : ''].filter(Boolean).join(' ');
  const innerClass = stack ? `${styles.inner} ${stack === 48 ? styles.stack48 : styles.stack40}` : styles.inner;
  return (
    <section id={id} className={className} aria-labelledby={labelledBy} data-probe={probe ?? (alt ? 'section-alt' : 'section')}>
      <div className={innerClass} data-probe="section-inner">
        {children}
      </div>
    </section>
  );
}

interface SectionBodyProps {
  narrow?: boolean;
  /** Frame of the child column, whose padding and border the design adds to the flex basis: `ruled` timeline, `boxed` layers. */
  frame?: 'ruled' | 'boxed';
  children: ReactNode;
}

/** The content column next to a `SectionHead`. */
export function SectionBody({ narrow = false, frame, children }: SectionBodyProps) {
  const className = [styles.body, narrow ? styles.bodyNarrow : '', frame === 'ruled' ? styles.bodyRuled : '', frame === 'boxed' ? styles.bodyBoxed : '']
    .filter(Boolean)
    .join(' ');
  return <div className={className}>{children}</div>;
}
