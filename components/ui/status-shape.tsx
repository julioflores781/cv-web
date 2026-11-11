import type { AdapterStatus } from '@/lib/api/types';
import styles from './ui.module.css';

/** The three status shapes: filled hexagon, empty hexagon, dashed hexagon. Decorative: the label carries the meaning. */
const SHAPES: Record<AdapterStatus, { fill: boolean; dash?: string }> = {
  'in-this-api': { fill: true },
  production: { fill: false },
  experiment: { fill: false, dash: '2 1.6' },
};

export function StatusShape({ status }: { status: AdapterStatus }) {
  const shape = SHAPES[status];
  return (
    <svg className={styles.statusShape} viewBox="0 0 20 20" aria-hidden="true" focusable="false" data-shape={status}>
      <polygon
        points="10,1.5 17.4,5.75 17.4,14.25 10,18.5 2.6,14.25 2.6,5.75"
        fill={shape.fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray={shape.dash}
      />
    </svg>
  );
}
