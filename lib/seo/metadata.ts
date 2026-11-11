import type { Metadata } from 'next';
import type { Resume } from '@/lib/api/types';
import { LANGS, OG_LOCALE, type Lang } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { interpolate } from '@/lib/i18n/format';
import { alternatesFor, routePath, type PageId, type Route } from '@/lib/i18n/routes';

const MAX_DESCRIPTION = 160;

export function pageUrl(siteUrl: string, route: Route): string {
  return `${siteUrl}${routePath(route)}`;
}

/** hreflang map (es, en and `x-default`) of one page, as absolute URLs. */
export function buildLanguageAlternates(siteUrl: string, page: PageId): Record<string, string> {
  return Object.fromEntries(Object.entries(alternatesFor(page)).map(([key, path]) => [key, `${siteUrl}${path}`]));
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= MAX_DESCRIPTION ? clean : `${clean.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`;
}

export function buildDescription(resume: Resume, lang: Lang): string {
  const { name, label, summary, tagline } = resume.profile;
  const own = summary?.trim() || tagline?.trim();
  return clip(own || interpolate(getDictionary(lang).meta.fallbackDescription, { name, label }));
}

function pageText(resume: Resume, route: Route): { title: string; description: string } {
  const { name, label } = resume.profile;
  if (route.page === 'services') {
    const { title, description } = getDictionary(route.lang).meta.services;
    return { title: interpolate(title, { name }), description: clip(description) };
  }
  return { title: `${name} — ${label}`, description: buildDescription(resume, route.lang) };
}

export function buildMetadata(resume: Resume, route: Route, siteUrl: string): Metadata {
  const { title, description } = pageText(resume, route);
  const url = pageUrl(siteUrl, route);
  const otherLocales = LANGS.filter((other) => other !== route.lang).map((other) => OG_LOCALE[other]);
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    alternates: { canonical: url, languages: buildLanguageAlternates(siteUrl, route.page) },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      siteName: resume.profile.name,
      locale: OG_LOCALE[route.lang],
      alternateLocale: otherLocales,
    },
  };
}
