import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Experience } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { resumeEs } from '@/tests/fixtures/resume';
import { Trajectory } from './trajectory';

const dict = getDictionary('es');

function renderTrajectory(experience: Experience[] = resumeEs.experience, lang: Lang = 'es') {
  return render(<Trajectory experience={experience} lang={lang} dict={getDictionary(lang)} index={1} />);
}

/** A fictional closed job with no phases nor achievements; overrides fill in the rest. */
function job(id: string, overrides: Partial<Experience> = {}): Experience {
  return {
    id,
    company: `Empresa ${id}`,
    position: `Puesto ${id}`,
    period: { start: '2015-01', end: '2016-12', current: false },
    phases: [],
    highlights: [],
    ...overrides,
  };
}

const items = (container: HTMLElement) => Array.from(container.querySelectorAll('ol > li')) as HTMLElement[];
const isFilled = (item: Element) => item.querySelector('span[aria-hidden="true"]')?.className.includes('current') ?? false;
/** The phase list of a job: the `ul` that is not inside the achievements disclosure. */
const phaseList = (item: Element) => Array.from(item.querySelectorAll('ul')).find((ul) => ul.closest('details') === null) ?? null;
const textsOf = (list: Element | null) => Array.from(list?.querySelectorAll('li') ?? []).map((li) => li.textContent);

describe('Trajectory (experience only)', () => {
  it('TR-T1 (BA-T30): 3 jobs in fixture order: period, «position · company» h3 and summary; filled marker only for the current job; section#experience with its h2 and no education inside', () => {
    const { container } = renderTrajectory();
    const list = items(container);
    expect(list).toHaveLength(3);
    const first = list[0] as HTMLElement;
    expect(within(first).getByText('2017 — hoy')).toBeInTheDocument();
    expect(within(first).getByRole('heading', { level: 3 }).textContent).toBe('Desarrolladora de ejemplo · Acme Ejemplo');
    expect(first.textContent).toContain('Trabajo ficticio en Acme para las pruebas.');
    expect(list.map((item) => item.querySelector('h3')?.textContent)).toEqual(
      resumeEs.experience.map((entry) => `${entry.position} · ${entry.company}`),
    );
    expect(list[1]?.textContent).toContain('2014 — 2016');
    expect(list[2]?.textContent).toContain('2010 — 2012');
    expect(list.map(isFilled)).toEqual([true, false, false]);
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'experience');
    expect(section?.querySelector('h2')?.textContent).toBe(dict.sections.trajectory.title);
    for (const text of ['Universidad Ejemplo', 'Certificado Ejemplo', 'Curso Ejemplo']) expect(container.textContent, text).not.toContain(text);
  });

  it('TR-T2: two current jobs (the second started later) and a closed one: both current ones are filled, the closed one hollow, and the input order is kept', () => {
    const experience = [
      job('primero', { period: { start: '2018-01', end: null, current: true } }),
      job('segundo', { period: { start: '2021-06', end: null, current: true } }),
      job('cerrado', { period: { start: '2019-01', end: '2020-01', current: false } }),
    ];
    const { container } = renderTrajectory(experience);
    const list = items(container);
    expect(list.map(isFilled)).toEqual([true, true, false]);
    for (const item of list) expect(item.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(list.map((item) => item.querySelector('h3')?.textContent)).toEqual(['Puesto primero · Empresa primero', 'Puesto segundo · Empresa segundo', 'Puesto cerrado · Empresa cerrado']);
  });

  it('TR-T3: phases read «title · client», only «title» without a client (absent or null), in order, outside any <details> and with no dangling separator', () => {
    const { container } = renderTrajectory([
      job('fases', { phases: [{ title: 'Fase A', client: 'Cliente X' }, { title: 'Fase B' }, { title: 'Fase C', client: null }] }),
    ]);
    const item = items(container)[0] as HTMLElement;
    const list = phaseList(item);
    expect(list).not.toBeNull();
    expect(list?.closest('details')).toBeNull();
    expect(textsOf(list)).toEqual(['Fase A · Cliente X', 'Fase B', 'Fase C']);
    for (const text of textsOf(list)) expect(text?.trim()).not.toMatch(/·$/);
    expect(item.querySelector('details')).toBeNull();
  });

  it('TR-T4: a job with 3 achievements has exactly one closed <details> whose first child is the summary «Ver logros (3)» / «See achievements (3)», then a ul of the 3 in order', () => {
    const highlights = ['Logro ficticio uno', 'Logro ficticio dos', 'Logro ficticio tres'];
    for (const [lang, label] of [['es', 'Ver logros (3)'], ['en', 'See achievements (3)']] as const) {
      const { container, unmount } = renderTrajectory([job('logros', { highlights })], lang);
      const details = container.querySelectorAll('details');
      expect(details, lang).toHaveLength(1);
      const disclosure = details[0] as HTMLDetailsElement;
      expect(disclosure.hasAttribute('open'), lang).toBe(false);
      expect(disclosure.open, lang).toBe(false);
      expect(disclosure.firstElementChild?.tagName, lang).toBe('SUMMARY');
      expect(disclosure.firstElementChild?.textContent, lang).toBe(label);
      expect(textsOf(disclosure.querySelector('ul')), lang).toEqual(highlights);
      unmount();
    }
  });

  it('TR-T5: no phases nor achievements → neither list nor <details>; achievements only → only <details>; phases only → only the phase list', () => {
    const { container } = renderTrajectory([
      job('nada'),
      job('logros', { highlights: ['Logro ficticio'] }),
      job('fases', { phases: [{ title: 'Fase ficticia', client: 'Cliente ficticio' }] }),
    ]);
    const [bare, achievements, phases] = items(container) as [HTMLElement, HTMLElement, HTMLElement];
    expect(phaseList(bare)).toBeNull();
    expect(bare.querySelector('details')).toBeNull();
    expect(phaseList(achievements)).toBeNull();
    expect(achievements.querySelectorAll('details')).toHaveLength(1);
    expect(textsOf(phaseList(phases))).toEqual(['Fase ficticia · Cliente ficticio']);
    expect(phases.querySelector('details')).toBeNull();
  });

  it('TR-T6: the summary is focusable without tabindex and a click opens the <details>; it has no tabindex, aria-expanded nor onclick of its own', () => {
    const { container } = renderTrajectory([job('logros', { highlights: ['Logro ficticio'] })]);
    const details = container.querySelector('details') as HTMLDetailsElement;
    const summary = details.querySelector('summary') as HTMLElement;
    summary.focus();
    expect(document.activeElement).toBe(summary);
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(details.hasAttribute('open')).toBe(true);
    for (const attribute of ['tabindex', 'aria-expanded', 'onclick']) expect(summary.hasAttribute(attribute), attribute).toBe(false);
  });

  it('TR-T7: blank achievements are not counted nor listed and a blank phase is dropped; only blank achievements → no <details>', () => {
    const mixed = renderTrajectory([job('mezcla', { highlights: ['Logro ficticio', '   '], phases: [{ title: '  ', client: 'Cliente huérfano' }] })]);
    const item = items(mixed.container)[0] as HTMLElement;
    expect(item.querySelector('summary')?.textContent).toBe('Ver logros (1)');
    expect(textsOf(item.querySelector('details ul'))).toEqual(['Logro ficticio']);
    expect(phaseList(item)).toBeNull();
    expect(item.textContent).not.toContain('Cliente huérfano');
    mixed.unmount();
    const blank = renderTrajectory([job('blancos', { highlights: [' ', ''] })]);
    expect(blank.container.querySelector('details')).toBeNull();
  });

  it('TR-T8 (BA-T31): no jobs → nothing at all (no section, anchor nor h2); a job without summary has no empty paragraph and still shows its phases', () => {
    const empty = renderTrajectory([]);
    expect(empty.container.innerHTML).toBe('');
    expect(empty.container.querySelector('#experience, h2')).toBeNull();
    empty.unmount();
    const { container } = renderTrajectory([job('sin-resumen', { summary: null, phases: [{ title: 'Fase sola', client: 'Cliente solo' }] }), job('resumen-blanco', { summary: '   ' })]);
    const [noSummary, blankSummary] = items(container) as [HTMLElement, HTMLElement];
    expect(noSummary.querySelectorAll('p')).toHaveLength(0);
    expect(blankSummary.querySelectorAll('p')).toHaveLength(0);
    expect(textsOf(phaseList(noSummary))).toEqual(['Fase sola · Cliente solo']);
  });
});
