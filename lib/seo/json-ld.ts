import type { Resume } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import { safeHttpUrl } from '@/lib/url';
import { buildDescription, pageUrl } from './metadata';

export interface PersonJsonLd {
  '@context': 'https://schema.org';
  '@type': 'Person';
  name: string;
  jobTitle: string;
  url: string;
  description: string;
  inLanguage: Lang;
  sameAs: string[];
  address?: { '@type': 'PostalAddress'; addressLocality?: string; addressCountry?: string };
}

/** Public data only: never the email, phone, document or birth date. */
export function buildPersonJsonLd(resume: Resume, lang: Lang, siteUrl: string): PersonJsonLd {
  const { name, label, city, countryCode } = resume.profile;
  const sameAs = resume.contact.profiles
    .map((link) => safeHttpUrl(link.url))
    .filter((url): url is string => url !== null);
  const person: PersonJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    jobTitle: label,
    url: pageUrl(siteUrl, { lang, page: 'profile' }),
    description: buildDescription(resume, lang),
    inLanguage: lang,
    sameAs,
  };
  if (city || countryCode) {
    person.address = {
      '@type': 'PostalAddress',
      ...(city ? { addressLocality: city } : {}),
      ...(countryCode ? { addressCountry: countryCode } : {}),
    };
  }
  return person;
}

/** Serializes for an inline `<script>`: `<` is escaped so data can never close the tag. */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
