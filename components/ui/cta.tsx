import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface CtaProps {
  href: string;
  variant?: 'primary' | 'outline';
  /** 24 px side padding (aside and project buttons) instead of the hero's 28 px. */
  compact?: boolean;
  /** Opens in a new tab with `rel="noopener noreferrer"`. */
  external?: boolean;
  /** Saves the target instead of navigating to it. */
  download?: boolean;
  /** `sm`: 48 px tall instead of the hero's 52 px (download button). */
  size?: 'md' | 'sm';
  probe?: string;
  children: ReactNode;
}

/** Call-to-action link: accent-filled (primary) or outlined. */
export function Cta({ href, variant = 'primary', compact = false, external = false, download = false, size = 'md', probe, children }: CtaProps) {
  const className = [styles.cta, variant === 'primary' ? styles.ctaPrimary : styles.ctaOutline, compact ? styles.ctaCompact : '', size === 'sm' ? styles.ctaSm : '']
    .filter(Boolean)
    .join(' ');
  return (
    <a className={className} href={href} data-probe={probe} {...(download ? { download: true } : {})} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}
