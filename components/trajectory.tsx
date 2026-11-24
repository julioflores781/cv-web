import type { Experience } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { clean, formatPeriod, interpolate } from '@/lib/i18n/format';
import { SectionBody, SectionShell } from './ui/section-shell';
import { SectionHead } from './ui/section-head';
import styles from './trajectory.module.css';

interface TrajectoryProps {
  experience: Experience[];
  lang: Lang;
  dict: Dictionary;
  index: number;
}

interface Phase {
  title: string;
  client: string;
}

/** Phases with a non-blank title, trimmed; `client` is '' when absent, null or blank (then no « · » is drawn). */
function phasesOf(job: Experience): Phase[] {
  return job.phases.flatMap((phase) => {
    const title = phase.title.trim();
    return title ? [{ title, client: phase.client?.trim() ?? '' }] : [];
  });
}

/** «01 / trayectoria»: only the jobs, in API order, with their phases visible and their achievements in a closed native disclosure. No jobs → no section. */
export function Trajectory({ experience, lang, dict, index }: TrajectoryProps) {
  if (experience.length === 0) return null;
  const { label, title } = dict.sections.trajectory;
  return (
    <SectionShell id="experience" labelledBy="experience-title">
      <SectionHead index={index} label={label} title={title} titleId="experience-title" />
      <SectionBody frame="ruled">
        <ol className={styles.list} data-probe="timeline">
          {experience.map((job) => {
            const when = formatPeriod(job.period, lang);
            const summary = job.summary?.trim();
            const phases = phasesOf(job);
            const highlights = job.highlights.map((highlight) => highlight.trim()).filter(Boolean);
            return (
              <li key={job.id} className={styles.item}>
                <span
                  className={job.period.current ? `${styles.marker} ${styles.current}` : styles.marker}
                  aria-hidden="true"
                  data-probe={job.period.current ? 'timeline-marker' : undefined}
                />
                {when ? (
                  <span className={`${styles.when} mono`} data-probe="timeline-period">
                    {when}
                  </span>
                ) : null}
                <div className={styles.text}>
                  <h3 className={`${styles.title} display`} data-probe="timeline-title">
                    {clean([job.position, job.company], ' · ')}
                  </h3>
                  {summary ? <p className={styles.summary}>{summary}</p> : null}
                  {phases.length > 0 ? (
                    <ul className={styles.phases}>
                      {phases.map((phase, i) => (
                        <li key={`${i}|${phase.title}`}>
                          {phase.title}
                          {phase.client ? <span className={styles.client}>{` · ${phase.client}`}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {highlights.length > 0 ? (
                    <details className={styles.achievements}>
                      <summary className={`${styles.toggle} mono`}>
                        {interpolate(dict.experience.achievements, { count: String(highlights.length) })}
                      </summary>
                      <ul className={styles.highlights}>
                        {highlights.map((highlight, i) => (
                          <li key={`${i}|${highlight}`}>{highlight}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </SectionBody>
    </SectionShell>
  );
}
