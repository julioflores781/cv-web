import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openItem, pairOf, renderServices, stubDialog, view } from '@/tests/helpers/admin-editor';
import { ParityPanel } from './parity-panel';

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = stubDialog();
});
afterEach(() => restoreDialog());

describe('ParityPanel', () => {
  it('T330: lists local and API differences, offers «Crear gemelo» and «Quitar» for unpaired items, announces the count and says when they match', () => {
    const onTwin = vi.fn();
    const onRemove = vi.fn();
    const { rerender } = render(
      <ParityPanel
        local={[{ path: 'services[1]', code: 'PARITY_MISMATCH' }]}
        published={[{ path: 'services[0].price', code: 'PARITY_MISMATCH' }]}
        unpaired={[{ key: 'k1', label: 'Solo español', missing: 'en' }]}
        onTwin={onTwin}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 diferencias entre español e inglés.');
    expect(screen.getByText('«Solo español» solo existe en español.')).toBeInTheDocument();
    expect(screen.getByText('services[0].price')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crear gemelo en EN' }));
    expect(onTwin).toHaveBeenCalledWith('k1', 'en');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar «Solo español»' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar' }));
    expect(onRemove).toHaveBeenCalledWith('k1');

    rerender(<ParityPanel local={[]} published={[]} unpaired={[]} onTwin={onTwin} onRemove={onRemove} />);
    expect(screen.getByRole('status')).toHaveTextContent('El español y el inglés coinciden.');
  });

  it('T330: in the editor, an item published in one language only shows as unpaired and its twin can be created', () => {
    renderServices({ initial: view({ services: [{ id: 'solo', title: 'Solo aquí', summary: 'Resumen' }] }, { services: [] }, { es: 1, en: 1 }, [{ path: 'services[0]', code: 'PARITY_MISMATCH' }]) });
    const panel = screen.getByRole('region', { name: 'Paridad ES/EN' });
    expect(within(panel).getByText('«Solo aquí» solo existe en español.')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear gemelo en EN' }));
    const item = openItem('Solo aquí');
    expect(pairOf(item, 'Título')).toHaveLength(2);
    expect(within(panel).queryByText(/solo existe/)).toBeNull();
  });

  it('regresion extra: «Crear gemelo» and «Quitar» move the focus to the same action of the next unpaired item, then to the panel title', async () => {
    const only = (id: string, title: string) => ({ id, title, summary: 'Resumen' });
    renderServices({
      initial: view({ services: [only('uno', 'Solo uno'), only('dos', 'Solo dos'), only('tres', 'Solo tres')] }, { services: [] }, { es: 1, en: 1 }),
    });
    const panel = screen.getByRole('region', { name: 'Paridad ES/EN' });
    const twins = () => within(panel).queryAllByRole('button', { name: 'Crear gemelo en EN' });
    expect(twins()).toHaveLength(3);
    fireEvent.click(twins()[0] as HTMLElement);
    await waitFor(() => expect(twins()[0]).toHaveFocus());
    expect(twins()).toHaveLength(2);
    fireEvent.click(within(panel).getByRole('button', { name: 'Quitar «Solo tres»' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Quitar «Solo dos»' })).toHaveFocus());
    fireEvent.click(twins()[0] as HTMLElement);
    await waitFor(() => expect(within(panel).getByRole('heading', { name: 'Paridad ES/EN' })).toHaveFocus());
  });

  it('regresion extra: «Crear gemelo» inside an item moves the focus to the first field it creates', async () => {
    renderServices({ initial: view({ services: [{ id: 'solo', title: 'Solo aquí', summary: 'Resumen' }] }, { services: [] }, { es: 1, en: 1 }) });
    const item = openItem('Solo aquí');
    fireEvent.click(within(item).getByRole('button', { name: 'Crear gemelo en EN' }));
    await waitFor(() => expect(pairOf(item, 'Título')[1]).toHaveFocus());
  });
});
