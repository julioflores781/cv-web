import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readText } from '@/tests/helpers/css';
import { renderServices } from '@/tests/helpers/admin-editor';
import { PairedFields, TextField } from './paired-field';

describe('PairedFields', () => {
  it('T331: visible labels with unique ids, lang on each column, the common block once, and stacked columns below 900 px', () => {
    render(
      <PairedFields
        common={<TextField id="c-id" label="Identificador" value="" onChange={() => undefined} />}
        es={<TextField id="es-title" label="Título" value="" onChange={() => undefined} />}
        en={<TextField id="en-title" label="Título" value="" onChange={() => undefined} />}
      />,
    );
    expect(screen.getAllByText('Común a los dos idiomas')).toHaveLength(1);
    const [es, en] = screen.getAllByLabelText('Título');
    expect(es?.closest('fieldset')).toHaveAttribute('lang', 'es');
    expect(en?.closest('fieldset')).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('group', { name: 'Español' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Inglés' })).toBeInTheDocument();

    const css = readText('components/admin/editor.module.css');
    expect(css).toMatch(/\.columns\s*{[^}]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/@media \(min-width: 900px\)\s*{\s*\.columns\s*{\s*grid-template-columns:\s*1fr 1fr;/);
  });

  it('T331: in the services editor every input has a visible label and a unique id', () => {
    const { container } = renderServices();
    const inputs = [...container.querySelectorAll('input, textarea')];
    expect(inputs.length).toBeGreaterThan(8);
    const ids = inputs.map((input) => input.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const input of inputs) expect(container.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()).toBeTruthy();
  });
});
