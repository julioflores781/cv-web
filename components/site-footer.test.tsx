import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('BA-T41: «Ada Ejemplo · Ciudad Ejemplo» and the Next.js line; without a city only the name; no «Astro» nor a year', () => {
    const { container, unmount } = render(<SiteFooter profile={resumeEs.profile} dict={getDictionary('es')} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Ada Ejemplo · Ciudad Ejemplo');
    expect(text).toContain('Next.js');
    expect(text).not.toMatch(/Astro|©|\b(19|20)\d{2}\b/);
    unmount();
    const noCity = render(<SiteFooter profile={{ ...resumeEn.profile, city: null }} dict={getDictionary('en')} />).container;
    const spans = Array.from(noCity.querySelectorAll('span')).map((span) => span.textContent);
    expect(spans[0]).toBe('Ada Ejemplo');
    expect(noCity.textContent).not.toMatch(/Astro|\b(19|20)\d{2}\b/);
  });
});
