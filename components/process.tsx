import type { Dictionary } from '@/lib/i18n/dictionaries';
import { SectionHead } from './ui/section-head';
import { SectionShell } from './ui/section-shell';
import styles from './process.module.css';

interface ProcessProps {
  process: NonNullable<Dictionary['process']>;
  index: number;
}

/** «02 / proceso»: the four steps, copy from the dictionary. */
export function Process({ process, index }: ProcessProps) {
  return (
    <SectionShell id="process" labelledBy="process-title" alt stack={48}>
      <SectionHead index={index} label={process.label} title={process.title} titleId="process-title" />
      <ol className={styles.list} data-probe="process">
        {process.steps.map((step, i) => (
          <li key={`${i}|${step.title}`} className={styles.step}>
            <span className={i === 0 ? styles.markerFirst : styles.marker} aria-hidden="true" />
            <span className={`${styles.number} display`} data-probe="process-number">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className={`${styles.title} display`} data-probe="process-title">
              {step.title}
            </h3>
            <p className={styles.text}>{step.text}</p>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}
