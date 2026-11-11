import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cssFiles, readText, rules } from '@/tests/helpers/css';
import { Cta } from './cta';
import { SectionHead } from './section-head';
import { SectionShell } from './section-shell';

describe('SectionHead and SectionShell', () => {
  it('BA-T36: SectionHead with index 2 reads «02 / etiqueta» and its h2 names the section by aria-labelledby', () => {
    const { container } = render(
      <SectionShell id="demo" labelledBy="demo-title">
        <SectionHead index={2} label="etiqueta" title="Título" titleId="demo-title" />
      </SectionShell>,
    );
    expect(screen.getByText('02 / etiqueta')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 2, name: 'Título' });
    expect(heading).toHaveAttribute('id', 'demo-title');
    expect(container.querySelector('section')).toHaveAttribute('aria-labelledby', 'demo-title');
    expect(screen.getByRole('region', { name: 'Título' })).toBe(container.querySelector('section'));
  });

  it('BA-T36: two digits are kept for the double-digit indexes and the paragraph text is optional', () => {
    const { container } = render(<SectionHead index={10} label="x" title="T" titleId="t" text="Texto" />);
    expect(screen.getByText('10 / x')).toBeInTheDocument();
    expect(container.querySelector('p:not(:first-child)')?.textContent).toBe('Texto');
  });
});

describe('single definition of the section frame', () => {
  it('BA-T38: only SectionShell declares max-width:1280px and padding:96px 24px', () => {
    const owners: string[] = [];
    for (const file of cssFiles()) {
      for (const rule of rules(readText(file))) {
        if (/max-width:\s*1280px/.test(rule.body) && /padding:\s*96px 24px/.test(rule.body)) owners.push(`${file} ${rule.selector}`);
      }
    }
    expect(owners).toEqual(['components/ui/ui.module.css .inner']);
  });
});

describe('Cta download button', () => {
  it('PD-T21: the download Cta is outlined, carries download, is 48 px tall (>=44) and the default Cta stays at 52 px', () => {
    render(
      <>
        <Cta href="/x.pdf" variant="outline" compact download size="sm">
          Descargar
        </Cta>
        <Cta href="/y" variant="outline">
          Normal
        </Cta>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Descargar' })).toHaveAttribute('download');
    expect(screen.getByRole('link', { name: 'Normal' })).not.toHaveAttribute('download');
    const all = rules(readText('components/ui/ui.module.css'));
    const sm = all.find((item) => item.selector === '.ctaSm');
    expect(Number(/min-height:\s*(\d+)px/.exec(sm?.body ?? '')?.[1])).toBeGreaterThanOrEqual(44);
    expect(sm?.body).toMatch(/min-height:\s*48px/);
    expect(all.find((item) => item.selector === '.cta')?.body).toMatch(/min-height:\s*52px/);
    expect(all.find((item) => item.selector === '.ctaOutline')?.body).toMatch(/border:\s*1px solid var\(--line\)/);
  });
});
