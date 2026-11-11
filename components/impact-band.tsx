import type { Impact } from '@/lib/api/types';
import styles from './impact-band.module.css';

interface ImpactBandProps {
  items: Impact[];
  label: string;
}

/** Strip of production figures between the hero and the first section (extension D7). */
export function ImpactBand({ items, label }: ImpactBandProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.band} aria-label={label}>
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li key={`${index}|${item.value}|${item.text}`} className={styles.cell}>
            <strong className={`${styles.value} display`}>{item.value}</strong>
            <span className={styles.text}>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
