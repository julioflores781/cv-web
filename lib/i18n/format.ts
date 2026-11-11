import type { Lang } from './config';
import { getDictionary } from './dictionaries';

export { interpolate } from './interpolate';
export { formatPrice } from './price';
export type { PriceLabels } from './price';

export interface PeriodLike {
  start: string;
  end?: string | null | undefined;
  current: boolean;
}

const YEAR = /^(\d{4})/;
const DASH = ' — ';

function yearOf(value: string | null | undefined): string | null {
  if (!value) return null;
  return YEAR.exec(value)?.[1] ?? null;
}

/** Formats a period as "2017 — hoy", "2014 — 2016" or a single year. Never throws on odd input. */
export function formatPeriod(period: PeriodLike, lang: Lang): string {
  const start = yearOf(period.start);
  const end = period.current ? getDictionary(lang).period.present : yearOf(period.end);
  if (!start) return end ?? '';
  if (!end || end === start) return start;
  return `${start}${DASH}${end}`;
}

/** Initials for the logo mark: first letter of the first and last word, "—" when there is no name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0];
  if (!first) return '—';
  const last = words.length > 1 ? words[words.length - 1]?.[0] : undefined;
  return `${first}${last ?? ''}`.toLocaleUpperCase();
}

/** Country name in the page language from an ISO 3166-1 alpha-2 code; `null` for unknown or malformed codes. */
export function formatCountry(code: string | null | undefined, lang: Lang): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' }).of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

/** Earliest start year across the experience entries, or `null` when none has a valid one. */
export function earliestYear(periods: readonly PeriodLike[]): string | null {
  const years = periods.flatMap((period) => yearOf(period.start) ?? []);
  return years.length === 0 ? null : years.reduce((min, year) => (year < min ? year : min));
}
