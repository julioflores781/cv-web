import { DEFAULT_LANG, LANGS, type Lang } from './config';

/**
 * The site has two pages per language: the services (obra), which is the home page, and the profile (plano).
 * This order is the order of the mode toggle and of the sitemap.
 */
export const PAGES = ['services', 'profile'] as const;

export type PageId = (typeof PAGES)[number];

export interface Route {
  lang: Lang;
  page: PageId;
}

/** URL segment of the profile page, per language (the services page is the language root). */
const PROFILE_SLUG: Record<Lang, string> = { es: 'perfil', en: 'profile' };

/** Resolves the optional catch-all segments of `app/[[...slug]]`; `null` when the URL is not one of the 4 pages. */
export function resolveRoute(slug: readonly string[] | undefined): Route | null {
  const segments = slug ?? [];
  const lang: Lang = segments[0] === 'en' ? 'en' : DEFAULT_LANG;
  const rest = lang === DEFAULT_LANG ? segments : segments.slice(1);
  if (rest.length === 0) return { lang, page: 'services' };
  if (rest.length === 1 && rest[0] === PROFILE_SLUG[lang]) return { lang, page: 'profile' };
  return null;
}

/** Catch-all segments of a route (the inverse of `resolveRoute`). */
export function routeSlug({ lang, page }: Route): string[] {
  const prefix = lang === DEFAULT_LANG ? [] : [lang];
  return page === 'services' ? prefix : [...prefix, PROFILE_SLUG[lang]];
}

/** Path of a route (trailing slash: see `trailingSlash` in next.config.ts). */
export function routePath(route: Route): string {
  const segments = routeSlug(route);
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

export function allRoutes(): Route[] {
  return LANGS.flatMap((lang) => PAGES.map((page) => ({ lang, page })));
}

/** Paths of the same page in every language, plus `x-default` (the default-language path): the hreflang set. */
export function alternatesFor(page: PageId): Record<Lang | 'x-default', string> {
  return {
    es: routePath({ lang: 'es', page }),
    en: routePath({ lang: 'en', page }),
    'x-default': routePath({ lang: DEFAULT_LANG, page }),
  };
}
