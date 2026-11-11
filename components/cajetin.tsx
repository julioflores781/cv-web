import type { Experience, Profile } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { earliestYear, formatCountry } from '@/lib/i18n/format';
import type { Route } from '@/lib/i18n/routes';
import styles from './cajetin.module.css';

interface CajetinProps {
  profile: Profile;
  experience: Experience[];
  route: Route;
  dict: Dictionary;
}

interface Cell {
  term: string;
  value: string;
}

/** The title block of a drawing: author, specialty, active since, location and sheet. A cell without data is omitted. */
export function Cajetin({ profile, experience, route, dict }: CajetinProps) {
  const text = dict.cajetin;
  const since = earliestYear(experience.map((job) => job.period));
  const place = [profile.city?.trim(), formatCountry(profile.countryCode, route.lang)].filter(Boolean).join(', ');
  const cells: Cell[] = [
    { term: text.author, value: profile.name },
    { term: text.specialty, value: profile.tagline?.trim() || profile.label },
    ...(since ? [{ term: text.since, value: since }] : []),
    ...(place ? [{ term: text.location, value: place }] : []),
    { term: text.sheet, value: text.sheets[route.page] },
  ];
  return (
    <div className={styles.cajetin} data-probe="cajetin">
      <dl className={styles.list}>
        {cells.map((cell, index) => (
          <div key={cell.term} className={styles.cell} data-probe={index === 1 ? 'cajetin-cell' : undefined}>
            <dt className={`${styles.term} mono`} data-probe="cajetin-dt">
              {cell.term}
            </dt>
            <dd className={styles.value} data-probe="cajetin-dd">
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
