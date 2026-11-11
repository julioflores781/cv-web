import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface EyebrowProps {
  probe?: string;
  children: ReactNode;
}

/** Small mono label on an accent background. */
export function Eyebrow({ probe, children }: EyebrowProps) {
  return (
    <p className={`${styles.eyebrow} mono`} data-probe={probe}>
      {children}
    </p>
  );
}
