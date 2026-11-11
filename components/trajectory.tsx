import type { Experience, Qualifications } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { formatPeriod } from '@/lib/i18n/format';
import { SectionBody, SectionShell } from './ui/section-shell';
import { SectionHead } from './ui/section-head';
import styles from './trajectory.module.css';

interface TrajectoryProps {
  experience: Experience[];
  education: Qualifications;
  lang: Lang;
  dict: Dictionary;
  index: number;
}

interface Entry {
  key: string;
  current: boolean;
  /** Mono column: period for a job, kind for an education entry. */
  when: string;
  title: string;
  text: string | null | undefined;
}

function clean(parts: Array<string | null | undefined>, separator: string): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(separator);
}

function entriesOf({ experience, education, lang, dict }: Omit<TrajectoryProps, 'index'>): Entry[] {
  const jobs = experience.map((job) => ({
    key: `job|${job.id}`,
    current: job.period.current,
    when: formatPeriod(job.period, lang),
    title: clean([job.position, job.company], ' · '),
    text: job.summary?.trim(),
  }));
  const kinds = dict.education;
  const studies = education.education.map((item, i) => {
    const heading = clean([item.studyType, item.area], ' · ');
    return {
      key: `edu|${i}`,
      current: false,
      when: kinds.education,
      title: heading || item.institution,
      text: heading ? item.institution : null,
    };
  });
  const certificates = education.certificates.map((item, i) => ({
    key: `cert|${i}`,
    current: false,
    when: kinds.certificate,
    title: item.name,
    text: item.issuer?.trim(),
  }));
  const courses = education.courses.map((item, i) => ({
    key: `course|${i}`,
    current: false,
    when: kinds.course,
    title: item.name,
    text: item.issuer?.trim(),
  }));
  return [...jobs, ...studies, ...certificates, ...courses];
}

/** «01 / trayectoria»: the career timeline, with education at the end (hollow markers). Nothing to show → no section. */
export function Trajectory({ experience, education, lang, dict, index }: TrajectoryProps) {
  const entries = entriesOf({ experience, education, lang, dict });
  if (entries.length === 0) return null;
  const { label, title } = dict.sections.trajectory;
  return (
    <SectionShell id="experience" labelledBy="experience-title">
      <SectionHead index={index} label={label} title={title} titleId="experience-title" />
      <SectionBody frame="ruled">
        <ol className={styles.list} data-probe="timeline">
          {entries.map((entry) => (
            <li key={entry.key} className={styles.item}>
              <span
                className={entry.current ? `${styles.marker} ${styles.current}` : styles.marker}
                aria-hidden="true"
                data-probe={entry.current ? 'timeline-marker' : undefined}
              />
              {entry.when ? (
                <span className={`${styles.when} mono`} data-probe="timeline-period">
                  {entry.when}
                </span>
              ) : null}
              <div className={styles.text}>
                <h3 className={`${styles.title} display`} data-probe="timeline-title">
                  {entry.title}
                </h3>
                {entry.text ? <p className={styles.summary}>{entry.text}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </SectionBody>
    </SectionShell>
  );
}
