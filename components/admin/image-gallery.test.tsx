import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredImage } from '@/lib/api/admin';
import { reply, stubDialog, stubFetch } from '@/tests/helpers/admin-editor';
import { ImageGallery } from './image-gallery';

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = stubDialog();
});
afterEach(() => {
  restoreDialog();
  vi.unstubAllGlobals();
});

const hex = (n: number) => n.toString(16).padStart(8, '0');
/** Keys whose first 8 characters differ, so each card reads apart by its short key (`0000000a….webp`). */
const key = (n: number) => `site/projects/${hex(n)}-0000-4000-8000-000000000000.webp`;
const stored = (n: number, referenced: boolean, bytes = 183_422): StoredImage => ({
  key: key(n),
  url: `https://media.example.test/${key(n)}`,
  bytes,
  lastModified: '2026-11-10T18:00:00Z',
  referenced,
});
const IMAGES = [stored(1, true), stored(2, true, 2_400_000), stored(3, false, 900)];
const card = (n: number) => screen.getByText(`${hex(n)}….webp`, { selector: 'p' }).closest('li') as HTMLElement;
const removeButton = (scope: HTMLElement) => within(scope).getByRole('button', { name: /^Borrar / });
const dialog = () => screen.getByRole('dialog');

describe('ImageGallery', () => {
  it('T383: each image shows its thumbnail, size, date and «En uso / Sin usar» as text with an icon; «En uso (versión antigua)» when only an old version uses it', () => {
    // Image 1 is in the published projects; image 2 is referenced only by the history; image 3 is unused.
    render(<ImageGallery images={IMAGES} currentKeys={[key(1)]} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Galería (3 imágenes)' })).toBeInTheDocument();
    const first = card(1);
    expect(within(first).getByRole('img')).toHaveAttribute('src', IMAGES[0]?.url);
    expect(first).toHaveTextContent('179,1 KB');
    const time = first.querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-11-10T18:00:00Z');
    expect(time?.textContent).toMatch(/2026/);
    expect(first).toHaveTextContent('Estado');
    expect(within(first).getByText('En uso').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(card(2)).toHaveTextContent('En uso (versión antigua)');
    expect(card(2)).toHaveTextContent('2,3 MB');
    expect(card(2)).toHaveTextContent(/Solo la usa una versión anterior del historial/);
    expect(card(3)).toHaveTextContent('Sin usar');
    expect(card(3)).toHaveTextContent('900 B');
    // The state is also part of the delete button's description.
    expect(removeButton(card(2))).toHaveAccessibleDescription('En uso (versión antigua)');
  });

  it('extra: when the published projects could not be read, referenced images are just «En uso»', () => {
    render(<ImageGallery images={IMAGES} currentKeys={null} />);
    expect(card(2)).toHaveTextContent('En uso');
    expect(card(2)).not.toHaveTextContent('versión antigua');
  });

  it('T384: deleting asks first; a 409 explains the history; a 204 removes the card, moves the focus and announces; a 404 removes it with a note; a 503 says so', async () => {
    const { mock } = stubFetch(
      reply(409, { code: 'IMAGE_IN_USE', requestId: 'ref-409' }),
      reply(200, { ok: true }),
      reply(404, { code: 'IMAGE_NOT_FOUND', requestId: 'ref-404' }),
      reply(503, { code: 'IMAGE_STORAGE_UNAVAILABLE', requestId: 'ref-503' }),
    );
    render(<ImageGallery images={[...IMAGES, stored(4, false)]} currentKeys={[key(1)]} />);

    fireEvent.click(removeButton(card(2)));
    expect(dialog()).toHaveAccessibleDescription(/Se borrará 00000002….webp del almacenamiento\. No se puede deshacer\./);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));
    expect(mock).not.toHaveBeenCalled();

    fireEvent.click(removeButton(card(2)));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Borrar' }));
    const alert = await within(card(2)).findByRole('alert');
    expect(alert).toHaveTextContent(/alguna versión del contenido la usa, quizá una antigua del historial/);
    expect(alert).toHaveTextContent('Referencia: ref-409');
    expect(mock.mock.calls[0]?.[0]).toBe('/admin/api/images/00000002-0000-4000-8000-000000000000/');
    expect(mock.mock.calls[0]?.[1]?.method).toBe('DELETE');

    fireEvent.click(removeButton(card(3)));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Borrar' }));
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(3));
    // The focus goes to the delete button of the card that took its place.
    await waitFor(() => expect(removeButton(card(4))).toHaveFocus());
    expect(screen.getByText('00000003….webp borrada.')).toHaveAttribute('role', 'status');

    fireEvent.click(removeButton(card(4)));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Borrar' }));
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByText('00000004….webp ya no existía; se ha quitado de la lista.')).toHaveAttribute('role', 'status');

    fireEvent.click(removeButton(card(1)));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Borrar' }));
    expect(await within(card(1)).findByRole('alert')).toHaveTextContent('El almacenamiento de imágenes no está disponible. Referencia: ref-503');
    expect(screen.queryAllByRole('listitem')).toHaveLength(2);
  });

  it('extra: a 401 on deleting goes to the login and comes back to the gallery', async () => {
    stubFetch(reply(401, { code: 'ADMIN_UNAUTHORIZED' }));
    const navigate = vi.fn();
    render(<ImageGallery images={IMAGES} currentKeys={[]} navigate={navigate} />);
    fireEvent.click(removeButton(card(3)));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Borrar' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/login/?expired=1&next=%2Fadmin%2Fimages%2F'));
  });

  it('T387: with 500 images the thumbnails are lazy, async, sized and without referrer', () => {
    const many = Array.from({ length: 500 }, (_, i) => stored(i + 1, i % 2 === 0));
    render(<ImageGallery images={many} currentKeys={[]} />);
    const thumbs = screen.getAllByRole('img');
    expect(thumbs).toHaveLength(500);
    for (const thumb of [thumbs[0], thumbs[250], thumbs[499]] as HTMLElement[]) {
      expect(thumb).toHaveAttribute('loading', 'lazy');
      expect(thumb).toHaveAttribute('decoding', 'async');
      expect(thumb).toHaveAttribute('width', '160');
      expect(thumb).toHaveAttribute('height', '90');
      expect(thumb).toHaveAttribute('referrerpolicy', 'no-referrer');
    }
    expect(thumbs.every((thumb) => thumb.getAttribute('loading') === 'lazy')).toBe(true);
  });
});
