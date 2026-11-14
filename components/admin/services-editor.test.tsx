import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeCurrency, parseAmount } from '@/lib/admin/content/services';
import { openItem, pairOf, renderServices, saveButton, stubFetch, reply, view } from '@/tests/helpers/admin-editor';

afterEach(() => vi.unstubAllGlobals());

describe('ServicesEditor', () => {
  it('T336: shows the pairs with labels and «A consultar»; empty state with «Añadir servicio»; the cap of 30 disables adding', () => {
    const { unmount } = renderServices();
    const priced = openItem('Servicio de ejemplo');
    expect(pairOf(priced, 'Título').map((input) => input.value)).toEqual(['Servicio de ejemplo', 'Sample service']);
    expect(within(priced).getByLabelText('Identificador')).toHaveAttribute('readonly');
    expect(within(priced).getByLabelText(/A consultar/)).not.toBeChecked();
    expect((within(priced).getByLabelText('Precio desde') as HTMLInputElement).value).toBe('1500');
    const onRequest = openItem('Servicio a consultar');
    expect(within(onRequest).getByLabelText(/A consultar/)).toBeChecked();
    expect(within(onRequest).queryByLabelText('Precio desde')).toBeNull();
    unmount();

    const empty = renderServices({ initial: view(null, null, { es: 0, en: 0 }) });
    expect(screen.getByText('Todavía no hay servicios publicados.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir servicio' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    empty.unmount();

    const many = { services: Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, title: `S${i}`, summary: 'R', price: null })) };
    renderServices({ initial: view(many, many) });
    const add = screen.getByRole('button', { name: 'Añadir servicio' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAccessibleDescription('Se ha alcanzado el máximo de 30 servicios.');
    fireEvent.click(add);
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
  });

  it("T337: amounts '', 1500, 1500.50, -1 and 1e3 give null/number/number/error/error; the currency turns upper case as it is typed", async () => {
    expect(parseAmount('')).toEqual({ ok: true, value: null });
    expect(parseAmount('1500')).toEqual({ ok: true, value: 1500 });
    expect(parseAmount('1500.50')).toEqual({ ok: true, value: 1500.5 });
    expect(parseAmount('-1')).toEqual({ ok: false });
    expect(parseAmount('1e3')).toEqual({ ok: false });
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency('eu1rx')).toBe('EUR');

    const { mock } = stubFetch(reply(200, {}));
    renderServices();
    const item = openItem('Servicio de ejemplo');
    const currency = within(item).getByLabelText('Moneda') as HTMLInputElement;
    fireEvent.change(currency, { target: { value: 'usd' } });
    expect(currency.value).toBe('USD');
    fireEvent.change(within(item).getByLabelText('Precio desde'), { target: { value: '1e3' } });
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    expect(within(item).getByLabelText('Precio desde')).toHaveAccessibleDescription(/El valor no es válido/);
  });

  it('extra: a new service takes its id from the Spanish title until the id is typed by hand', () => {
    renderServices();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir servicio' }));
    const fresh = screen.getAllByRole('listitem')[2] as HTMLElement;
    const id = within(fresh).getByLabelText('Identificador') as HTMLInputElement;
    fireEvent.change(pairOf(fresh, 'Título')[0], { target: { value: 'Servicio de ejemplo' } });
    expect(id.value).toBe('servicio-de-ejemplo');
    fireEvent.change(id, { target: { value: 'propio' } });
    fireEvent.change(pairOf(fresh, 'Título')[0], { target: { value: 'Otro título' } });
    expect(id.value).toBe('propio');
  });

  it('regresion extra: two services with the same title keep the accordion buttons apart by position', () => {
    const twin = (title: string) => ({
      services: [
        { id: 'servicio-a', title, summary: 'Resumen ficticio.', price: null },
        { id: 'servicio-b', title, summary: 'Resumen ficticio.', price: null },
      ],
    });
    renderServices({ initial: view(twin('Servicio repetido'), twin('Repeated service')) });
    const names = screen.getAllByRole('button').filter((button) => button.closest('[data-item]')).map((button) => button.getAttribute('aria-label') ?? button.textContent ?? '');
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
    for (const position of [1, 2]) {
      for (const tool of ['Subir', 'Bajar', 'Quitar']) expect(names).toContain(`${tool} «Servicio repetido» (posición ${position})`);
    }
  });
});
