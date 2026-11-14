import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openItem, renderServices, saveButton, stubDialog, stubFetch, reply } from '@/tests/helpers/admin-editor';

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = stubDialog();
});
afterEach(() => {
  restoreDialog();
  vi.unstubAllGlobals();
});

const toggles = () => screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded') && button.closest('li'));

describe('ItemList', () => {
  it('T332: adding focuses the first field of the new item; removing asks only for items with content or published ones and focuses the neighbour', () => {
    renderServices();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir servicio' }));
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const fresh = items[2] as HTMLElement;
    expect(within(fresh).getByLabelText('Identificador')).toHaveFocus();

    // An empty new item goes without asking; the focus moves to the neighbour's header.
    fireEvent.click(within(fresh).getByRole('button', { name: /^Quitar/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(toggles()[1]).toHaveFocus();

    // A published item asks first; cancelling keeps it.
    fireEvent.click(screen.getByRole('button', { name: 'Quitar «Servicio de ejemplo» (posición 1)' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Se quitará «Servicio de ejemplo» en español y en inglés');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar «Servicio de ejemplo» (posición 1)' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(toggles()[0]).toHaveFocus();
  });

  it('T332: move up/down are labelled with the title and position, inert at the ends, keep the focus and announce the position', () => {
    renderServices();
    const up = screen.getByRole('button', { name: 'Subir «Servicio de ejemplo» (posición 1)' });
    expect(up).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(up);
    expect(toggles()[0]).toHaveTextContent('Servicio de ejemplo');
    expect(screen.getByRole('button', { name: 'Bajar «Servicio a consultar» (posición 2)' })).toHaveAttribute('aria-disabled', 'true');
    const down = screen.getByRole('button', { name: 'Bajar «Servicio de ejemplo» (posición 1)' });
    fireEvent.click(down);
    expect(toggles()[0]).toHaveTextContent('Servicio a consultar');
    expect(screen.getByRole('button', { name: 'Bajar «Servicio de ejemplo» (posición 2)' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Bajar «Servicio de ejemplo» (posición 2)' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByRole('status').some((node) => node.textContent === '«Servicio de ejemplo» está ahora en la posición 2 de 2.')).toBe(true);
  });

  it('T333: the accordion uses aria-expanded; the header shows title, id and an error badge; items with errors open after a failed save', async () => {
    stubFetch(reply(422, { code: 'CONTENT_INVALID', requestId: 'r', errors: [{ path: 'es.services[1].summary', code: 'REQUIRED' }] }));
    renderServices({ validate: () => [] });
    const [first, second] = toggles() as [HTMLElement, HTMLElement];
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(first).toHaveTextContent('Servicio de ejemplo');
    expect(first).toHaveTextContent('servicio-ejemplo');
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(first.getAttribute('aria-controls') ?? '')).not.toHaveAttribute('hidden');
    fireEvent.change(within(openItem('Servicio de ejemplo')).getAllByLabelText('Título')[0] as HTMLElement, { target: { value: 'Cambio' } });
    expect(second).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(saveButton());
    await waitFor(() => expect(second).toHaveAttribute('aria-expanded', 'true'));
    expect(second).toHaveTextContent('1 error');
    expect(second.closest('li')).toHaveAttribute('data-errors', 'true');
  });
});
