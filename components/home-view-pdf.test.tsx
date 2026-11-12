import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cvPdfHref } from '@/lib/pdf/files';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { HomeView } from './home-view';

const SITE = 'https://cv.example.test';

describe('Download CV button (Cta in the architecture section)', () => {
  it('PD-T18: the ES profile links «Descargar CV (PDF)» to the ES file with download; EN links the EN file', () => {
    const es = render(<HomeView resume={resumeEs} pdfHref={cvPdfHref('es')} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    const link = screen.getByRole('link', { name: 'Descargar CV (PDF)' });
    expect(link).toHaveAttribute('href', '/cv-julio-flores-es.pdf');
    expect(link).toHaveAttribute('download');
    expect(link.closest('section')?.querySelector('h2')?.textContent).toBe(getDictionary('es').sections.architecture.title);
    es.unmount();
    render(<HomeView resume={resumeEn} pdfHref={cvPdfHref('en')} route={{ lang: 'en', page: 'profile' }} siteUrl={SITE} />);
    expect(screen.getByRole('link', { name: 'Download CV (PDF)' })).toHaveAttribute('href', '/cv-julio-flores-en.pdf');
  });

  it('PD-T19: without a PDF the button is absent and the architecture section is intact', () => {
    const withPdf = render(<HomeView resume={resumeEs} pdfHref="/cv-julio-flores-es.pdf" route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    const sectionWith = withPdf.container.querySelector('#architecture')?.innerHTML ?? '';
    withPdf.unmount();
    const without = render(<HomeView resume={resumeEs} pdfHref={null} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    expect(screen.queryByRole('link', { name: /CV \(PDF\)/ })).toBeNull();
    const section = without.container.querySelector('#architecture');
    expect(section).not.toBeNull();
    expect(section?.querySelectorAll('[data-layer]')).toHaveLength(3);
    expect(sectionWith).toContain('data-probe="download-cv"');
    expect(section?.innerHTML).not.toContain('data-probe="download-cv"');
  });

  it('PD-T20: the services view never has the button, even if a PDF exists', () => {
    render(<HomeView resume={resumeEs} pdfHref="/cv-julio-flores-es.pdf" route={{ lang: 'es', page: 'services' }} siteUrl={SITE} />);
    expect(screen.queryByRole('link', { name: /CV \(PDF\)/ })).toBeNull();
  });
});
