import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Architecture } from '@/lib/api/types';
import { buildHexModel } from '@/lib/architecture/model';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adapter, architectureEn, architectureEs, architectureOf } from '@/tests/fixtures/content';
import { readText } from '@/tests/helpers/css';
import { HexPlane } from './hex-plane';

const es = getDictionary('es').plane;
const en = getDictionary('en').plane;

function plane(architecture: Architecture, labels = es) {
  const model = buildHexModel(architecture);
  if (!model) throw new Error('fixture without ports');
  return render(<HexPlane model={model} labels={labels} />);
}
const panel = () => document.querySelector('[data-probe="panel"]') as HTMLElement;
const nodes = () => screen.getAllByRole('button');

describe('HexPlane', () => {
  it('HX-T24: three ports give a core with core/ and its name, three aria-pressed buttons in a labelled group, the first pressed, and 01 / 03', () => {
    const { container } = plane(architectureEs);
    const core = container.querySelector('[data-probe="core"]') as HTMLElement;
    expect(core).toHaveTextContent('core/');
    expect(core).toHaveTextContent('Dominio de ejemplo');
    const group = screen.getByRole('group', { name: 'Puertos del hexágono' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Base de datos de ejemplo',
      'Mensajería de ejemplo',
      'Identidad de ejemplo',
    ]);
    expect(panel()).toHaveTextContent('01 / 03');
  });

  it('HX-T25: the nodes of three ports sit at positions 0, 2 and 4 (left/top in %), centred with translate(-50%, -50%)', () => {
    plane(architectureEs);
    expect(nodes().map((button) => [button.style.left, button.style.top])).toEqual([
      ['50%', '12%'],
      ['82.9%', '69%'],
      ['17.1%', '69%'],
    ]);
    expect(readText('components/hex-plane.module.css')).toMatch(/\.node\s*{[^}]*transform:\s*translate\(-50%,\s*-50%\)/);
  });

  it('HX-T26: clicking port 2 presses it alone, shows its name and 02 / 03, and the flow line ends at the core from its position', () => {
    const { container } = plane(architectureEs);
    fireEvent.click(nodes()[1] as HTMLElement);
    expect(nodes().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(panel()).toHaveTextContent('02 / 03');
    expect(within(panel()).getByText('Mensajería de ejemplo')).toBeInTheDocument();
    const flow = container.querySelector('line[data-probe="flow"]') as SVGLineElement;
    expect([flow.getAttribute('x1'), flow.getAttribute('y1'), flow.getAttribute('x2'), flow.getAttribute('y2')]).toEqual(['82.9', '69', '50', '50']);
    fireEvent.click(nodes()[0] as HTMLElement);
    expect(panel()).toHaveTextContent('Dónde se guarda lo ficticio.');
  });

  it('HX-T27: the core is the same element with the same text whatever is selected, and is not inside a fieldset or a button', () => {
    const { container } = plane(architectureEs);
    const core = container.querySelector('[data-probe="core"]') as HTMLElement;
    const text = core.textContent;
    for (const node of nodes()) {
      fireEvent.click(node);
      expect(container.querySelector('[data-probe="core"]')).toBe(core);
      expect(core.textContent).toBe(text);
    }
    expect(core.closest('fieldset, button')).toBeNull();
  });

  it('HX-T28: choosing the second adapter of a port changes only that port; the others stay on their first', () => {
    const two = (id: string) => [adapter(`${id}1`, { name: `${id} uno`, status: 'in-this-api' }), adapter(`${id}2`, { name: `${id} dos`, status: 'experiment', note: `${id} nota` })];
    plane({
      core: { name: 'C', description: null },
      ports: [
        { id: 'a', name: 'Puerto A', description: null, adapters: two('A') },
        { id: 'b', name: 'Puerto B', description: null, adapters: two('B') },
      ],
    });
    const radios = () => screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios().map((radio) => radio.checked)).toEqual([true, false]);
    fireEvent.click(radios()[1] as HTMLInputElement);
    expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
    expect(panel()).toHaveTextContent('A nota');
    fireEvent.click(nodes()[1] as HTMLElement);
    expect(radios().map((radio) => radio.checked)).toEqual([true, false]);
    expect(panel()).not.toHaveTextContent('B nota');
    fireEvent.click(nodes()[0] as HTMLElement);
    expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
  });

  it('HX-T29: a port with one adapter shows its name and status without a radio group', () => {
    plane(architectureEs);
    fireEvent.click(nodes()[1] as HTMLElement);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('group', { name: /Adaptador/ })).toBeNull();
    expect(panel()).toHaveTextContent('Cola Gamma');
    expect(panel()).toHaveTextContent('proyecto de prueba');
  });

  it('HX-T30: each status shows its dictionary label and a different decorative SVG shape', () => {
    plane({
      core: { name: 'C', description: null },
      ports: [
        {
          id: 'p',
          name: 'P',
          description: null,
          adapters: [
            adapter('1', { name: 'Uno', status: 'in-this-api' }),
            adapter('2', { name: 'Dos', status: 'production' }),
            adapter('3', { name: 'Tres', status: 'experiment' }),
          ],
        },
      ],
    });
    const seen: string[] = [];
    for (const [index, label] of ['implementado en esta API', 'en producción', 'proyecto de prueba'].entries()) {
      fireEvent.click(screen.getAllByRole('radio')[index] as HTMLElement);
      expect(panel()).toHaveTextContent(label);
      const shape = panel().querySelector('svg[data-shape]') as SVGElement;
      expect(shape.getAttribute('aria-hidden')).toBe('true');
      seen.push(shape.innerHTML);
    }
    expect(new Set(seen).size).toBe(3);
  });

  it('HX-T31: the note appears only when the adapter has one', () => {
    plane(architectureEs);
    expect(panel()).not.toHaveTextContent('Nota de ejemplo');
    fireEvent.click(screen.getAllByRole('radio')[1] as HTMLElement);
    expect(panel()).toHaveTextContent('Nota de ejemplo');
    fireEvent.click(screen.getAllByRole('radio')[0] as HTMLElement);
    expect(panel()).not.toHaveTextContent('Nota de ejemplo');
  });

  it('HX-T32: the panel is a polite live region whose content changes when selecting', () => {
    plane(architectureEs);
    expect(panel().getAttribute('aria-live')).toBe('polite');
    const before = panel().textContent;
    fireEvent.click(nodes()[2] as HTMLElement);
    expect(panel().textContent).not.toBe(before);
    expect(panel().getAttribute('aria-live')).toBe('polite');
  });

  it('HX-T33: the server HTML carries one noscript per port with every adapter, its status in text and its note', () => {
    const model = buildHexModel(architectureEs);
    if (!model) throw new Error('no model');
    const html = renderToStaticMarkup(<HexPlane model={model} labels={es} />);
    const blocks = [...html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map((match) => match[1] as string);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain('Almacén Alfa');
    expect(blocks[0]).toContain('implementado en esta API');
    expect(blocks[0]).toContain('Almacén Beta');
    expect(blocks[0]).toContain('en producción');
    expect(blocks[0]).toContain('Nota de ejemplo');
    expect(blocks[1]).toContain('Cola Gamma');
    expect(blocks[1]).toContain('Solo en pruebas');
    // The first port is already selected in the static HTML.
    expect(html).toMatch(/aria-pressed="true"[^>]*>Base de datos de ejemplo/);
  });

  it('HX-T34: the component defines no onKeyDown and no positive tabindex', () => {
    const source = readText('components/hex-plane.tsx');
    expect(source).not.toMatch(/onKeyDown|onKeyUp|onKeyPress/);
    expect(source).not.toMatch(/tabIndex/i);
  });

  it('HX-T35: ports and adapters sharing an API id still get unique DOM ids, and for / aria-describedby point at real elements', () => {
    const duplicated: Architecture = {
      core: { name: 'C', description: null },
      ports: [
        { id: 'same', name: 'Uno', description: null, adapters: [adapter('same', { name: 'A1' }), adapter('same', { name: 'A2' })] },
        { id: 'same', name: 'Dos', description: null, adapters: [adapter('same', { name: 'B1' }), adapter('same', { name: 'B2' })] },
      ],
    };
    const { container } = plane(duplicated);
    const check = () => {
      const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const label of container.querySelectorAll('label[for]')) {
        const target = container.querySelector(`[id="${label.getAttribute('for')}"]`);
        expect(target?.tagName).toBe('INPUT');
        expect(label.contains(target)).toBe(true);
      }
      for (const radio of container.querySelectorAll('[aria-describedby]')) {
        expect(container.querySelector(`[id="${radio.getAttribute('aria-describedby')}"]`)).not.toBeNull();
      }
    };
    check();
    fireEvent.click(nodes()[1] as HTMLElement);
    check();
  });

  it('HX-T37: radial and list set data-layout and both keep the API order in the DOM', () => {
    const radial = plane(architectureOf(6));
    expect(radial.container.querySelector('[data-probe="plane"]')?.getAttribute('data-layout')).toBe('radial');
    expect(nodes().map((button) => button.textContent)).toEqual(['Puerto 1', 'Puerto 2', 'Puerto 3', 'Puerto 4', 'Puerto 5', 'Puerto 6']);
    radial.unmount();
    const list = plane(architectureOf(8));
    expect(list.container.querySelector('[data-probe="plane"]')?.getAttribute('data-layout')).toBe('list');
    expect(nodes().map((button) => button.textContent)).toEqual(Array.from({ length: 8 }, (_, i) => `Puerto ${i + 1}`));
    expect(nodes().every((button) => button.style.left === '')).toBe(true);
    expect(list.container.querySelector('line[data-probe="flow"]')).toBeNull();
    fireEvent.click(nodes()[7] as HTMLElement);
    expect(panel()).toHaveTextContent('08 / 08');
  });

  it('HX-T39: a very long adapter or port name is shown whole, not truncated in JS', () => {
    const long = 'Nombre-larguísimo-'.repeat(12);
    plane({ core: { name: 'C', description: null }, ports: [{ id: 'p', name: long, description: null, adapters: [adapter('a', { name: long })] }] });
    expect(nodes()[0]).toHaveTextContent(long);
    expect(panel().textContent).toContain(`${long}${long}`);
  });

  it('HX-T40: in English the core tag, the legend, the statuses and the fixed texts come from the EN dictionary only', () => {
    plane(architectureEn, en);
    expect(screen.getByRole('group', { name: 'Hexagon ports' })).toBeInTheDocument();
    expect(document.body).toHaveTextContent('core/');
    expect(document.body).toHaveTextContent('adapters');
    expect(document.body).toHaveTextContent('tap a node to trace the call');
    fireEvent.click(screen.getAllByRole('radio')[1] as HTMLElement);
    expect(panel()).toHaveTextContent('in production');
    for (const spanish of ['adaptadores', 'puertos', 'contrato', 'toca un nodo', 'en producción', 'implementado']) {
      expect(document.body.textContent).not.toContain(spanish);
    }
  });
});
