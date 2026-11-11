'use client';

import { useEngagement } from './engagement-provider';
import styles from './selection-line.module.css';

interface SelectionLineProps {
  /** «selección →» */
  label: string;
  /** «sin bloques marcados» */
  none: string;
}

/** The picked services, as a mono line above the contact links. Nothing outside the services page. */
export function SelectionLine({ label, none }: SelectionLineProps) {
  const engagement = useEngagement();
  if (!engagement) return null;
  const { selected } = engagement;
  return (
    <p className={`${styles.line} mono`} data-probe="selection-line">
      {selected.length > 0 ? `${label} ${selected.join(' + ')}` : none}
    </p>
  );
}
