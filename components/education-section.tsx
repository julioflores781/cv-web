import type { Certificate, Course, Qualifications } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { clean } from '@/lib/i18n/format';
import { SectionBody, SectionShell } from './ui/section-shell';
import { SectionHead } from './ui/section-head';
import styles from './education-section.module.css';

export interface EducationItem {
  main: string;
  detail: string | null;
}

export interface EducationColumn {
  key: 'degrees' | 'certificates' | 'courses';
  heading: string;
  items: EducationItem[];
}

function named(items: ReadonlyArray<Certificate | Course>): EducationItem[] {
  return items.map((item) => ({ main: item.name.trim(), detail: item.issuer?.trim() || null }));
}

/**
 * The education columns, in order Degree · Certifications · Courses. A degree reads «studyType · area» over its institution, or just the
 * institution when it has neither. Entries whose main text is blank are dropped, and a column left without entries is omitted.
 */
export function educationColumns(education: Qualifications, dict: Dictionary): EducationColumn[] {
  const degrees = education.education.map((item): EducationItem => {
    const heading = clean([item.studyType, item.area], ' · ');
    return heading ? { main: heading, detail: item.institution.trim() || null } : { main: item.institution.trim(), detail: null };
  });
  const columns: EducationColumn[] = [
    { key: 'degrees', heading: dict.education.degrees, items: degrees },
    { key: 'certificates', heading: dict.education.certificates, items: named(education.certificates) },
    { key: 'courses', heading: dict.education.courses, items: named(education.courses) },
  ];
  return columns
    .map((column) => ({ ...column, items: column.items.filter((item) => item.main !== '') }))
    .filter((column) => column.items.length > 0);
}

interface EducationSectionProps {
  /** From `educationColumns`, computed once by the view (it also decides the numbering). */
  columns: EducationColumn[];
  dict: Dictionary;
  index: number;
}

/** «0N / formación»: a compact block of up to three columns, with no timeline. No columns → no section. */
export function EducationSection({ columns, dict, index }: EducationSectionProps) {
  if (columns.length === 0) return null;
  const { label, title } = dict.sections.education;
  return (
    <SectionShell id="education" labelledBy="education-title">
      <SectionHead index={index} label={label} title={title} titleId="education-title" />
      <SectionBody>
        <div className={styles.columns}>
          {columns.map((column) => (
            <div key={column.key} className={styles.column}>
              <h3 className={`${styles.heading} mono`}>{column.heading}</h3>
              <ul className={styles.entries}>
                {column.items.map((item, i) => (
                  <li key={`${i}|${item.main}`} className={styles.entry}>
                    <p className={`${styles.main} display`}>{item.main}</p>
                    {item.detail ? <p className={styles.detail}>{item.detail}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionBody>
    </SectionShell>
  );
}
