import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Qualifications } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { EducationSection, educationColumns } from './education-section';

const NONE: Qualifications = { education: [], certificates: [], courses: [] };

function renderEducation(education: Qualifications, lang: Lang = 'es', index = 2) {
  const dict = getDictionary(lang);
  return render(<EducationSection columns={educationColumns(education, dict)} dict={dict} index={index} />);
}

interface Column {
  heading: string;
  /** Each entry as its paragraphs: [main] or [main, detail]. */
  entries: string[][];
}

/** The rendered columns: each h3 with the entries of the list next to it. */
function columnsOf(container: HTMLElement): Column[] {
  return Array.from(container.querySelectorAll('section h3')).map((h3) => ({
    heading: h3.textContent ?? '',
    entries: Array.from(h3.parentElement?.querySelectorAll('ul > li') ?? []).map((li) => Array.from(li.querySelectorAll('p')).map((p) => p.textContent ?? '')),
  }));
}

describe('EducationSection', () => {
  it('TR-T9 (BA-T32): resumeEs gives section#education «0N / formación» · «Formación» with Titulación, Certificaciones and Cursos in order, their entries, and no timeline', () => {
    const { container } = renderEducation(resumeEs.education, 'es', 2);
    const section = container.querySelector('section#education') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.getAttribute('aria-labelledby')).toBe('education-title');
    expect(section.querySelector('p')?.textContent).toBe('02 / formación');
    expect(section.querySelector('h2')?.textContent).toBe('Formación');
    expect(section.querySelector('h2')?.id).toBe('education-title');
    expect(columnsOf(container)).toEqual([
      { heading: 'Titulación', entries: [['Grado · Informática', 'Universidad Ejemplo']] },
      { heading: 'Certificaciones', entries: [['Certificado Ejemplo', 'Entidad Ejemplo']] },
      { heading: 'Cursos', entries: [['Curso Ejemplo']] },
    ]);
    expect(section.querySelector('ol')).toBeNull();
    expect(section.querySelector('span[aria-hidden]')).toBeNull();
  });

  it('TR-T10: only certificates → a single «Certificaciones» column; degree and courses → two columns, Titulación before Cursos', () => {
    const certificates = renderEducation({ ...NONE, certificates: resumeEs.education.certificates });
    expect(columnsOf(certificates.container).map((column) => column.heading)).toEqual(['Certificaciones']);
    certificates.unmount();
    const twoColumns = renderEducation({ ...resumeEs.education, certificates: [] });
    expect(columnsOf(twoColumns.container).map((column) => column.heading)).toEqual(['Titulación', 'Cursos']);
  });

  it('TR-T11: three empty lists, or lists holding only blank entries, give no columns and render nothing', () => {
    const dict = getDictionary('es');
    expect(educationColumns(NONE, dict)).toEqual([]);
    expect(renderEducation(NONE).container.innerHTML).toBe('');
    const blank: Qualifications = {
      education: [{ institution: ' ' }, { institution: '  ', studyType: null, area: '' }],
      certificates: [{ name: '  ', issuer: 'Entidad Ejemplo' }],
      courses: [{ name: '\t', issuer: null }],
    };
    expect(educationColumns(blank, dict)).toEqual([]);
    expect(renderEducation(blank).container.innerHTML).toBe('');
  });

  it('TR-T12: a degree with neither type nor area shows the institution with no detail; with only the area, the area over the institution; a course issuer is its detail', () => {
    const dict = getDictionary('es');
    const [institutionOnly] = educationColumns({ ...NONE, education: [{ institution: 'Universidad Ejemplo', studyType: null }] }, dict);
    expect(institutionOnly?.items).toEqual([{ main: 'Universidad Ejemplo', detail: null }]);
    const [areaOnly] = educationColumns({ ...NONE, education: [{ institution: 'Universidad Ejemplo', area: 'Informática' }] }, dict);
    expect(areaOnly?.items).toEqual([{ main: 'Informática', detail: 'Universidad Ejemplo' }]);
    const [course] = educationColumns({ ...NONE, courses: [{ name: 'Curso Ejemplo', issuer: 'Academia Ejemplo' }] }, dict);
    expect(course).toEqual({ key: 'courses', heading: 'Cursos', items: [{ main: 'Curso Ejemplo', detail: 'Academia Ejemplo' }] });

    const { container } = renderEducation({ ...NONE, education: [{ institution: 'Universidad Ejemplo' }], courses: [{ name: 'Curso Ejemplo', issuer: 'Academia Ejemplo' }] });
    expect(columnsOf(container)).toEqual([
      { heading: 'Titulación', entries: [['Universidad Ejemplo']] },
      { heading: 'Cursos', entries: [['Curso Ejemplo', 'Academia Ejemplo']] },
    ]);
  });

  it('TR-T13: resumeEn in EN: h2 «Education», «0N / education», Degree · Certifications · Courses and the English data', () => {
    const { container } = renderEducation(resumeEn.education, 'en', 2);
    const section = container.querySelector('section#education') as HTMLElement;
    expect(section.querySelector('h2')?.textContent).toBe('Education');
    expect(section.querySelector('p')?.textContent).toBe('02 / education');
    expect(columnsOf(container)).toEqual([
      { heading: 'Degree', entries: [['Degree · Computing', 'Example University']] },
      { heading: 'Certifications', entries: [['Example Certificate', 'Example Body']] },
      { heading: 'Courses', entries: [['Example Course']] },
    ]);
    expect(container.textContent).not.toContain('Universidad Ejemplo');
  });
});
