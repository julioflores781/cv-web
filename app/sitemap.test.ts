// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getConfig } from '@/lib/api';
import sitemap from './sitemap';

describe('sitemap', () => {
  it('BA-T6: lists the 4 pages and each one alternates to its counterpart in the other language', () => {
    const base = getConfig().siteUrl;
    const entries = sitemap();
    expect(entries.map((entry) => entry.url).sort()).toEqual(
      [`${base}/`, `${base}/servicios/`, `${base}/en/`, `${base}/en/services/`].sort(),
    );
    const byUrl = new Map(entries.map((entry) => [entry.url, entry.alternates?.languages]));
    expect(byUrl.get(`${base}/`)).toMatchObject({ es: `${base}/`, en: `${base}/en/` });
    expect(byUrl.get(`${base}/en/`)).toMatchObject({ es: `${base}/`, en: `${base}/en/` });
    expect(byUrl.get(`${base}/servicios/`)).toMatchObject({ es: `${base}/servicios/`, en: `${base}/en/services/` });
    expect(byUrl.get(`${base}/en/services/`)).toMatchObject({ es: `${base}/servicios/`, en: `${base}/en/services/` });
  });
});
