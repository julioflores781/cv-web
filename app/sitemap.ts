import type { MetadataRoute } from 'next';
import { getConfig } from '@/lib/api';
import { allRoutes } from '@/lib/i18n/routes';
import { buildLanguageAlternates, pageUrl } from '@/lib/seo/metadata';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const { siteUrl } = getConfig();
  return allRoutes().map((route) => ({
    url: pageUrl(siteUrl, route),
    alternates: { languages: buildLanguageAlternates(siteUrl, route.page) },
  }));
}
