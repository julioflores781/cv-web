import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { resumeEs } from '@/tests/fixtures/resume';
import { Trajectory } from './trajectory';

const dict = getDictionary('es');
const noEducation = { education: [], certificates: [], courses: [] };

function renderTrajectory(experience = resumeEs.experience, education = resumeEs.education) {
  return render(<Trajectory experience={experience} education={education} lang="es" dict={dict} index={1} />);
}

describe('Trajectory', () => {
  it('BA-T30: 3 jobs and education form the timeline: period, «position · company» h3, summary; filled marker only for the current job; education last with hollow markers', () => {
    const { container } = renderTrajectory();
    const items = container.querySelectorAll('ol > li');
    // 3 jobs + 1 degree + 1 certificate + 1 course.
    expect(items).toHaveLength(6);
    const first = items[0] as HTMLElement;
    expect(within(first).getByText('2017 — hoy')).toBeInTheDocument();
    expect(within(first).getByRole('heading', { level: 3 }).textContent).toBe('Desarrolladora de ejemplo · Acme Ejemplo');
    expect(first.textContent).toContain('Trabajo ficticio en Acme para las pruebas.');
    expect(items[1]?.textContent).toContain('2014 — 2016');
    expect(items[2]?.textContent).toContain('2010 — 2012');
    const filled = Array.from(items).map((item) => item.querySelector('span[aria-hidden="true"]')?.className.includes('current'));
    expect(filled).toEqual([true, false, false, false, false, false]);
    for (const item of Array.from(items).slice(3)) expect(item.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(items[3]?.textContent).toContain('Grado · Informática');
    expect(items[3]?.textContent).toContain('Universidad Ejemplo');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(dict.sections.trajectory.title);
    expect(container.querySelector('section')).toHaveAttribute('id', 'experience');
  });

  it('BA-T31: no experience and no education → no section, anchor or heading; with only education the timeline shows only education', () => {
    const empty = renderTrajectory([], noEducation);
    expect(empty.container.innerHTML).toBe('');
    empty.unmount();
    const { container } = renderTrajectory([], resumeEs.education);
    expect(container.querySelectorAll('ol > li')).toHaveLength(3);
    expect(container.textContent).not.toContain('Acme Ejemplo');
    expect(container.textContent).toContain('Formación');
  });

  it('BA-T32: education lists the degree, the certificate and the course; with no degrees only the certificates remain', () => {
    const { container, unmount } = renderTrajectory([], resumeEs.education);
    for (const text of ['Universidad Ejemplo', 'Certificado Ejemplo', 'Entidad Ejemplo', 'Curso Ejemplo']) {
      expect(container.textContent, text).toContain(text);
    }
    unmount();
    const certificatesOnly = renderTrajectory([], { ...resumeEs.education, education: [], courses: [] }).container;
    expect(certificatesOnly.querySelectorAll('ol > li')).toHaveLength(1);
    expect(certificatesOnly.textContent).toContain('Certificado Ejemplo');
    expect(certificatesOnly.textContent).not.toContain('Universidad Ejemplo');
  });
});
