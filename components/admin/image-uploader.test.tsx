import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AbortableResult } from '@/lib/admin/browser-client';
import { fakeImage } from '@/tests/helpers/admin-images';
import { ImageUploader } from './image-uploader';

afterEach(() => {
  vi.restoreAllMocks();
});

const CONTEXT = '(común · Proyecto 1: Proyecto de prueba)';
const png = (name: string, size = 2048) => new File([fakeImage('png', size)], name, { type: 'image/png' });
const uploaded = (n: number) => ({ key: `site/projects/00000000-0000-4000-8000-00000000000${n}.png`, url: `https://media.example.test/${n}.png`, contentType: 'image/png', bytes: 2048, width: 640, height: 360 });

/** An upload stand-in whose answers the test releases one by one. */
function controlledUpload() {
  const pending: Array<{ file: File; resolve: (result: AbortableResult<unknown>) => void }> = [];
  const upload = vi.fn((file: File) => new Promise<AbortableResult<unknown>>((resolve) => pending.push({ file, resolve })));
  return { upload, pending };
}

function renderUploader(props: Partial<Parameters<typeof ImageUploader>[0]> = {}) {
  const onUploaded = vi.fn();
  const onExpired = vi.fn();
  const utils = render(<ImageUploader id="subida" remaining={10} context={CONTEXT} onUploaded={onUploaded} onExpired={onExpired} {...props} />);
  const input = document.getElementById('subida-input') as HTMLInputElement;
  const choose = (...files: File[]) => fireEvent.change(input, { target: { files } });
  return { ...utils, onUploaded, onExpired, input, choose };
}

const queue = () => screen.getByRole('list', { name: `Estado de las subidas ${CONTEXT}` });
const row = (name: string) => within(queue()).getByText(name).closest('li') as HTMLElement;

describe('ImageUploader', () => {
  it('T376: a drop zone and a keyboard-reachable file button; several files go one at a time with a state each; rejected ones are listed with their reason and never sent', async () => {
    const { upload, pending } = controlledUpload();
    const { input, choose, onUploaded } = renderUploader({ upload });
    const button = screen.getByRole('button', { name: `Elegir imágenes ${CONTEXT}` });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAccessibleDescription(/JPEG, PNG, GIF o WebP de hasta 5 MiB\. Quedan 10 huecos/);
    expect(screen.getByText('Arrastra imágenes aquí')).toBeInTheDocument();
    // The real picker is the hidden input: multiple, image types only, out of the tab order (the button is the way in).
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('multiple');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/gif,image/webp');
    expect(input).toHaveAttribute('tabindex', '-1');
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    button.focus();
    fireEvent.click(button);
    expect(click).toHaveBeenCalledTimes(1);

    const text = new File(['hola, esto es texto'], 'notas.png', { type: 'image/png' });
    const huge = new File([fakeImage('png', 5 * 1024 * 1024 + 1)], 'enorme.png', { type: 'image/png' });
    const empty = new File([], 'vacia.png', { type: 'image/png' });
    choose(png('uno.png'), text, png('dos.png'), huge, empty);

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(row('notas.png')).toHaveTextContent('Rechazada: No es una imagen JPEG, PNG, GIF o WebP.');
    expect(row('enorme.png')).toHaveTextContent('Rechazada: Supera los 5 MiB.');
    expect(row('vacia.png')).toHaveTextContent('Rechazada: El archivo está vacío.');
    expect(row('uno.png')).toHaveTextContent('Subiendo…');
    expect(row('dos.png')).toHaveTextContent('En cola');
    // Sequential: the second one waits for the first.
    expect(upload.mock.calls.map(([file]) => file.name)).toEqual(['uno.png']);

    await act(async () => pending[0]?.resolve({ kind: 'ok', status: 201, data: uploaded(1) }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(row('uno.png')).toHaveTextContent('Subida');
    expect(row('dos.png')).toHaveTextContent('Subiendo…');
    expect(onUploaded).toHaveBeenCalledWith(uploaded(1), expect.any(File));

    await act(async () => pending[1]?.resolve({ kind: 'problem', status: 503, code: 'IMAGE_STORAGE_UNAVAILABLE', requestId: 'ref-503' }));
    await waitFor(() => expect(row('dos.png')).toHaveTextContent('Error: El almacenamiento de imágenes no está disponible. Referencia: ref-503'));
    // Nothing else was sent: rejected files never reach the network and failures are not retried.
    expect(upload.mock.calls.map(([file]) => file.name)).toEqual(['uno.png', 'dos.png']);
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Subidas terminadas: 1 correcta, 1 con problemas.');
  });

  it('T376: files beyond the free slots are rejected before sending; a dead session cancels the queue and reports it', async () => {
    const { upload, pending } = controlledUpload();
    const { choose, onExpired } = renderUploader({ upload, remaining: 2 });
    choose(png('a.png'), png('b.png'), png('c.png'));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(row('c.png')).toHaveTextContent('Rechazada: No caben más imágenes en este proyecto (máximo 10).');
    await act(async () => pending[0]?.resolve({ kind: 'expired' }));
    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
    expect(row('a.png')).toHaveTextContent('Cancelada');
    expect(row('b.png')).toHaveTextContent('Cancelada');
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('T377: dropping a file that is not an image rejects it; the drag highlight is also said in words', async () => {
    const upload = vi.fn();
    renderUploader({ upload });
    const zone = screen.getByText('Arrastra imágenes aquí').parentElement as HTMLElement;
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
    expect(zone).toHaveAttribute('data-dragging', 'true');
    expect(within(zone).getByText('Suelta para subir')).toBeInTheDocument();
    const html = new File(['<!doctype html><title>x</title>'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.drop(zone, { dataTransfer: { files: [html] } });
    expect(zone).not.toHaveAttribute('data-dragging');
    expect(within(zone).getByText('Arrastra imágenes aquí')).toBeInTheDocument();
    await waitFor(() => expect(row('foto.jpg')).toHaveTextContent('Rechazada: No es una imagen JPEG, PNG, GIF o WebP.'));
    expect(upload).not.toHaveBeenCalled();
  });
});
