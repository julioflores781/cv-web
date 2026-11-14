import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AbortableResult } from '@/lib/admin/browser-client';
import { projectsModel } from '@/lib/admin/content/projects';
import type { ImageLibrary } from '@/lib/admin/images';
import { sample } from '@/tests/helpers/admin-content';
import { fakeImage } from '@/tests/helpers/admin-images';
import { openItem, renderProjects, reply, saveButton, savedView, stubDialog, stubFetch, view } from '@/tests/helpers/admin-editor';

let restoreDialog: () => void;
const created: string[] = [];
const revoked: string[] = [];
beforeEach(() => {
  restoreDialog = stubDialog();
  created.length = 0;
  revoked.length = 0;
  // jsdom has no object URLs; these stand-ins record what the editor creates and revokes.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => {
      const url = `blob:vista-${created.length + 1}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => void revoked.push(url)),
  });
});
afterEach(() => {
  restoreDialog();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PUBLIC = 'Proyecto público de ejemplo';
const KEY = 'site/projects/00000000-0000-4000-8000-000000000001.webp';
const NEW_KEY = 'site/projects/00000000-0000-4000-8000-0000000000b2.png';
const LIBRARY: ImageLibrary = { kind: 'ok', images: [{ key: KEY, url: `https://media.example.test/${KEY}` }] };
const block = (item: HTMLElement) => within(item).getByRole('group', { name: 'Imágenes' });
const button = (scope: HTMLElement, label: string) => within(scope).getByRole('button', { name: (name) => name.startsWith(`${label} (`) });
const alt = (scope: HTMLElement, n: number, lang: 'ES' | 'EN') =>
  within(scope).getByRole('textbox', { name: (name) => name.startsWith(`Texto alternativo de la imagen ${n} (${lang}) (`) }) as HTMLInputElement;
const rows = (scope: HTMLElement) => within(scope).getAllByRole('listitem').filter((li) => li.id.includes('images'));
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
const okUpload = (key = NEW_KEY) =>
  vi.fn((): Promise<AbortableResult<unknown>> => Promise.resolve({ kind: 'ok', status: 201, data: { key, url: `https://media.example.test/${key}`, contentType: 'image/png', bytes: 2048, width: 800, height: 600 } }));

async function uploadInto(item: HTMLElement, name = 'nueva.png') {
  const input = within(block(item)).getByRole('button', { name: /^Elegir imágenes/ }).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([fakeImage('png', 2048, 800, 600)], name, { type: 'image/png' })] } });
}

type SavedBody = { documents: { es: { projects: Array<{ images?: Array<Record<string, unknown>> }> }; en: { projects: Array<{ images?: Array<Record<string, unknown>> }> } } };

describe('ProjectImagesBlock', () => {
  it('T378: an uploaded image enters the project pending, with an empty alt; the focus goes to the Spanish alt and it is announced; a failed preview shows the text and revokes the object URL', async () => {
    const upload = okUpload();
    renderProjects({ library: LIBRARY, upload });
    const item = openItem(PUBLIC);
    await uploadInto(item);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const esAlt = await waitFor(() => alt(item, 2, 'ES'));
    await waitFor(() => expect(esAlt).toHaveFocus());
    expect(esAlt.value).toBe('');
    expect(alt(item, 2, 'EN').value).toBe('');
    expect(within(block(item)).getByText(/^Imagen subida y añadida como imagen 2, pendiente de guardar/)).toHaveAttribute('role', 'status');
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument();

    // The preview is the local file (an object URL), not a request to the bucket.
    const preview = within(rows(block(item))[1] as HTMLElement).getByRole('img');
    expect(preview).toHaveAttribute('src', 'blob:vista-1');
    fireEvent.error(preview);
    expect(revoked).toEqual(['blob:vista-1']);
    const second = rows(block(item))[1] as HTMLElement;
    expect(within(second).queryByRole('img')).toBeNull();
    expect(second).toHaveTextContent('Vista previa no disponible.');
    // The text shown in its place is the image's own alt, once written.
    type(alt(item, 2, 'ES'), 'Captura nueva');
    expect(rows(block(item))[1]).toHaveTextContent('Vista previa no disponible. Captura nueva');
    expect(created).toEqual(['blob:vista-1']);
  });

  it('T379: each row has a thumbnail, a short key, the size, «Portada» on the first, «Hacer portada», up/down, remove from the project and required ES/EN alts of at most 200', async () => {
    renderProjects({ library: LIBRARY, upload: okUpload() });
    const item = openItem(PUBLIC);
    await uploadInto(item);
    await waitFor(() => expect(rows(block(item))).toHaveLength(2));
    const [first, second] = rows(block(item)) as [HTMLElement, HTMLElement];
    const thumb = within(first).getByRole('img');
    expect(thumb).toHaveAttribute('src', `https://media.example.test/${KEY}`);
    expect(thumb).toHaveAccessibleName('Panel de reservas con la agenda semanal de ejemplo');
    expect(first).toHaveTextContent('Imagen 1');
    expect(first).toHaveTextContent('Portada');
    expect(first).toHaveTextContent('00000000….webp');
    expect(first).toHaveTextContent('1280 × 720 px');
    expect(second).not.toHaveTextContent('Portada');
    expect(second).toHaveTextContent('800 × 600 px');
    // The first has no «make cover» nor «up»; the last has no «down».
    expect(within(first).queryByRole('button', { name: /^Hacer portada/ })).toBeNull();
    expect(within(first).queryByRole('button', { name: /^Subir la imagen/ })).toBeNull();
    expect(within(second).queryByRole('button', { name: /^Bajar la imagen/ })).toBeNull();
    expect(button(first, 'Bajar la imagen 1')).toBeInTheDocument();
    expect(button(first, 'Quitar la imagen 1 del proyecto')).toBeInTheDocument();
    expect(button(second, 'Subir la imagen 2')).toBeInTheDocument();

    fireEvent.click(button(second, 'Hacer portada la imagen 2'));
    const reordered = rows(block(item)) as [HTMLElement, HTMLElement];
    expect(reordered[0]).toHaveTextContent('Portada');
    expect(reordered[0]).toHaveTextContent('800 × 600 px');
    expect(reordered[0]).toHaveFocus();
    expect(within(block(item)).getByText('La imagen 2 es ahora la 1 (portada). No se publica nada hasta que guardes.')).toHaveAttribute('role', 'status');
    // The alt travelled with its image.
    expect(alt(item, 2, 'ES').value).toBe('Panel de reservas con la agenda semanal de ejemplo');
    fireEvent.click(button(reordered[0], 'Bajar la imagen 1'));
    expect(rows(block(item))[1]).toHaveTextContent('800 × 600 px');
    expect(rows(block(item))[1]).toHaveFocus();

    // Alts: required and at most 200, in both languages, checked before sending.
    const { mock } = stubFetch(reply(200, {}));
    type(alt(item, 1, 'EN'), 'x'.repeat(201));
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    expect(alt(item, 2, 'ES')).toHaveAccessibleDescription(/Error: Este campo es obligatorio/);
    expect(alt(item, 2, 'EN')).toHaveAttribute('aria-invalid', 'true');
    expect(alt(item, 1, 'EN')).toHaveAccessibleDescription(/Error: El texto es demasiado largo/);
    expect(alt(item, 1, 'ES')).toHaveAccessibleDescription(/Obligatorio\. Describe la imagen/);

    // Removing takes it out of the project only.
    fireEvent.click(button(rows(block(item))[1] as HTMLElement, 'Quitar la imagen 2 del proyecto'));
    expect(rows(block(item))).toHaveLength(1);
    expect(block(item)).toHaveFocus();
    expect(within(block(item)).getByText('Imagen 2 quitada del proyecto. Sigue en el almacenamiento.')).toBeInTheDocument();
  });

  it('T380: a key that is not in the listing is flagged «no encontrada»; with the listing at 503 the block says the storage is unavailable and the rest of the editor still saves', async () => {
    const orphan: ImageLibrary = { kind: 'ok', images: [] };
    const first = renderProjects({ library: orphan });
    const row = rows(block(openItem(PUBLIC)))[0] as HTMLElement;
    expect(row).toHaveAccessibleDescription(/No encontrada en el almacenamiento: se verá rota/);
    expect(within(row).queryByRole('img')).toBeNull();
    first.unmount();

    const saved = projectsModel.serialize(projectsModel.pair(sample('projects.es'), sample('projects.en')));
    const { mock } = stubFetch(reply(200, savedView(saved, { es: 2, en: 2 })));
    renderProjects({ library: { kind: 'unavailable', reference: 'ref-r2' } });
    const item = openItem(PUBLIC);
    expect(block(item)).toHaveAccessibleDescription(/El almacenamiento de imágenes no está disponible.*Puedes seguir editando el resto/);
    expect(block(item)).toHaveTextContent('Referencia: ref-r2');
    expect(within(block(item)).queryByText(/No encontrada/)).toBeNull();
    const title = within(item).getByRole('textbox', { name: (name) => name.startsWith('Título (español') }) as HTMLInputElement;
    type(title, 'Proyecto renombrado');
    fireEvent.click(saveButton());
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
  });

  it('T381: with 10 images the picker is disabled with a message', () => {
    const tenImages = (document: Record<string, unknown>) => {
      const projects = (document as { projects: Array<Record<string, unknown>> }).projects;
      const images = Array.from({ length: 10 }, (_, i) => ({ key: `site/projects/00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}.png`, alt: `Imagen ${i}`, width: 10, height: 10 }));
      return { projects: [{ ...projects[0], images }, projects[1]] };
    };
    const upload = vi.fn();
    renderProjects({ initial: view(tenImages(sample('projects.es')), tenImages(sample('projects.en'))), upload });
    const item = openItem(PUBLIC);
    const choose = within(block(item)).getByRole('button', { name: /^Elegir imágenes/ });
    expect(choose).toHaveAttribute('aria-disabled', 'true');
    expect(choose).toHaveAccessibleDescription('Este proyecto ya tiene 10 imágenes, el máximo. Quita alguna para subir otra.');
    const input = choose.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeDisabled();
    fireEvent.click(choose);
    expect(upload).not.toHaveBeenCalled();
  });

  it('T382: once serialized, key, width and height are identical in ES and EN and only the alt changes', async () => {
    const { mock } = stubFetch(reply(200, {}));
    renderProjects({ library: LIBRARY, upload: okUpload() });
    const item = openItem(PUBLIC);
    await uploadInto(item);
    await waitFor(() => expect(rows(block(item))).toHaveLength(2));
    type(alt(item, 2, 'ES'), 'Pantalla de pagos de ejemplo');
    type(alt(item, 2, 'EN'), 'Sample payments screen');
    fireEvent.click(button(rows(block(item))[1] as HTMLElement, 'Hacer portada la imagen 2'));
    fireEvent.click(saveButton());
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const sent = (JSON.parse(String(mock.mock.calls[0]?.[1]?.body)) as SavedBody).documents;
    const es = sent.es.projects[0]?.images ?? [];
    const en = sent.en.projects[0]?.images ?? [];
    const shape = (images: Array<Record<string, unknown>>) => images.map(({ key, width, height }) => ({ key, width, height }));
    expect(shape(es)).toEqual([{ key: NEW_KEY, width: 800, height: 600 }, { key: KEY, width: 1280, height: 720 }]);
    expect(shape(en)).toEqual(shape(es));
    expect(es.map((image) => image.alt)).toEqual(['Pantalla de pagos de ejemplo', 'Panel de reservas con la agenda semanal de ejemplo']);
    expect(en[0]?.alt).toBe('Sample payments screen');
    expect(Object.keys(es[0] ?? {}).sort()).toEqual(['alt', 'height', 'key', 'width']);
    await act(async () => undefined);
  });
});
