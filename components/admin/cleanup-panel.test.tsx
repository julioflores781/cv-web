import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reply, stubDialog, stubFetch } from '@/tests/helpers/admin-editor';
import { CleanupPanel } from './cleanup-panel';

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = stubDialog();
});
afterEach(() => {
  restoreDialog();
  vi.unstubAllGlobals();
});

const ORPHANS = ['site/projects/0000000a-0000-4000-8000-000000000000.png', 'site/projects/0000000b-0000-4000-8000-000000000000.png'];
const hours = () => screen.getByRole('spinbutton', { name: 'Antigüedad mínima (horas)' });
const simulate = () => screen.getByRole('button', { name: /^Simular/ });
const runButton = () => screen.getByRole('button', { name: /^Borrar \d+ imágen/ });

describe('CleanupPanel', () => {
  it('T385: «Simular» shows wouldDelete and kept; «Borrar N» only after a current simulation with N > 0; changing the hours voids it; it confirms and reports the count', async () => {
    const { mock, bodies } = stubFetch(
      reply(200, { dryRun: true, deleted: [], wouldDelete: ORPHANS, kept: 3 }),
      reply(200, { dryRun: true, deleted: [], wouldDelete: ORPHANS, kept: 3 }),
      reply(200, { dryRun: false, deleted: ORPHANS, wouldDelete: [], kept: 3 }),
    );
    const onDeleted = vi.fn();
    render(<CleanupPanel onDeleted={onDeleted} onExpired={vi.fn()} />);
    expect(hours()).toHaveValue(24);
    expect(runButton()).toBeDisabled();

    fireEvent.click(simulate());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se borrarían 2 imágenes; se conservan 3.'));
    expect(bodies[0]).toEqual({ dryRun: true, olderThanHours: 24 });
    expect(runButton()).toHaveTextContent('Borrar 2 imágenes');
    expect(runButton()).toBeEnabled();

    // A different number of hours makes the simulation stale.
    fireEvent.change(hours(), { target: { value: '48' } });
    expect(runButton()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Has cambiado las horas: vuelve a simular antes de borrar.');
    fireEvent.change(hours(), { target: { value: '24' } });
    expect(runButton()).toBeEnabled();
    fireEvent.change(hours(), { target: { value: '0' } });
    fireEvent.click(simulate());
    expect(hours()).toHaveAttribute('aria-invalid', 'true');
    expect(hours()).toHaveAccessibleDescription(/Error: Indica un número entero de horas, como mínimo 1/);
    expect(mock).toHaveBeenCalledTimes(1);

    fireEvent.change(hours(), { target: { value: '12' } });
    fireEvent.click(simulate());
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(bodies[1]).toEqual({ dryRun: true, olderThanHours: 12 });

    fireEvent.click(runButton());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleDescription('Se borrarán 2 imágenes sin usar con más de 12 horas. No se puede deshacer.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(mock).toHaveBeenCalledTimes(2);
    fireEvent.click(runButton());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Borrar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se han borrado 2 imágenes.'));
    expect(bodies[2]).toEqual({ dryRun: false, olderThanHours: 12 });
    expect(onDeleted).toHaveBeenCalledWith(ORPHANS);
    // A real deletion needs a fresh simulation.
    expect(runButton()).toBeDisabled();
  });

  it('T385: with nothing to delete it says so and «Borrar» stays disabled; a failure is shown with its reference', async () => {
    stubFetch(reply(200, { dryRun: true, deleted: [], wouldDelete: [], kept: 4 }), reply(503, { code: 'IMAGE_STORAGE_UNAVAILABLE', requestId: 'ref-503' }));
    render(<CleanupPanel onDeleted={vi.fn()} onExpired={vi.fn()} />);
    fireEvent.click(simulate());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No hay nada que limpiar.'));
    expect(runButton()).toBeDisabled();
    fireEvent.click(simulate());
    expect(await screen.findByRole('alert')).toHaveTextContent('El almacenamiento de imágenes no está disponible. Referencia: ref-503');
  });
});
