import { describe, expect, it, vi } from 'vitest';
import { checkImageBytes, checkImageFile, IMAGE_HEAD_BYTES, imageIdOf, isKnownUnsupported, MAX_IMAGE_BYTES, parseUploaded, sniffImage } from './images';
import { fakeImage } from '@/tests/helpers/admin-images';

const bytes = (...values: Array<number | string>): Uint8Array<ArrayBuffer> => {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === 'number') out.push(value);
    else for (const char of value) out.push(char.charCodeAt(0));
  }
  while (out.length < IMAGE_HEAD_BYTES) out.push(0);
  return Uint8Array.from(out);
};

/** A `Blob` whose `slice` is observed, to prove that only the head is read. */
function spiedFile(head: Uint8Array<ArrayBuffer>, size: number, name: string, type: string): { file: File; slice: ReturnType<typeof vi.fn> } {
  const filler = new Uint8Array(Math.max(0, size - head.byteLength));
  const file = new File([head.subarray(0, Math.min(size, head.byteLength)), filler], name, { type });
  const original = file.slice.bind(file);
  const slice = vi.fn((start?: number, end?: number) => original(start, end));
  Object.defineProperty(file, 'slice', { value: slice });
  return { file, slice };
}

describe('image pre-check (browser and handler)', () => {
  it('T366: JPEG, PNG, GIF87a/89a and WebP are accepted by their bytes whatever the name or MIME; SVG, HEIC, PDF, text and HTML renamed .jpg are refused by type', async () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImage(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImage(bytes('GIF87a'))).toBe('image/gif');
    expect(sniffImage(bytes('GIF89a'))).toBe('image/gif');
    expect(sniffImage(bytes('RIFF', 0x10, 0, 0, 0, 'WEBP'))).toBe('image/webp');
    for (const refused of [
      bytes('<svg xmlns="h'),
      bytes('<?xml version'),
      bytes(0, 0, 0, 0x18, 'ftypheic'),
      bytes('%PDF-1.7'),
      bytes('hola, mundo.'),
      bytes('<!doctype htm'),
      bytes('GIF88a'),
      bytes('RIFF', 0, 0, 0, 0, 'WAVE'),
    ]) {
      expect(sniffImage(refused)).toBeNull();
    }

    // Name and declared MIME never count: a real PNG called «foto.svg» passes, an HTML called «foto.jpg» with image/jpeg does not.
    const png = fakeImage('png', 64);
    expect(await checkImageFile(new File([png], 'foto.svg', { type: 'image/svg+xml' }))).toEqual({ ok: true, type: 'image/png' });
    const html = new TextEncoder().encode('<!doctype html><html><body>no</body></html>');
    expect(await checkImageFile(new File([html], 'foto.jpg', { type: 'image/jpeg' }))).toEqual({ ok: false, reason: 'type' });
    // Fewer than 12 bytes cannot be told apart (the API needs 12 too).
    expect(checkImageBytes(bytes(0xff, 0xd8, 0xff).subarray(0, 3), 3)).toEqual({ ok: false, reason: 'type' });
  });

  it('T366: empty is refused; exactly 5 MiB passes and 5 MiB + 1 does not; only the first 12 bytes are read', async () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(await checkImageFile(new File([], 'vacia.png', { type: 'image/png' }))).toEqual({ ok: false, reason: 'empty' });
    const head = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a);

    const exact = spiedFile(head, MAX_IMAGE_BYTES, 'justa.png', 'image/png');
    expect(await checkImageFile(exact.file)).toEqual({ ok: true, type: 'image/png' });
    expect(exact.slice).toHaveBeenCalledTimes(1);
    expect(exact.slice).toHaveBeenCalledWith(0, IMAGE_HEAD_BYTES);

    const over = spiedFile(head, MAX_IMAGE_BYTES + 1, 'grande.png', 'image/png');
    expect(await checkImageFile(over.file)).toEqual({ ok: false, reason: 'too-large' });
    // The size alone decides: nothing is read.
    expect(over.slice).not.toHaveBeenCalled();

    expect(checkImageBytes(head, MAX_IMAGE_BYTES)).toEqual({ ok: true, type: 'image/png' });
    expect(checkImageBytes(head, MAX_IMAGE_BYTES + 1)).toEqual({ ok: false, reason: 'too-large' });
    expect(checkImageBytes(new Uint8Array(0), 0)).toEqual({ ok: false, reason: 'empty' });
  });

  it('extra: the id of a key is its lowercase UUID; anything else has none', () => {
    expect(imageIdOf('site/projects/00000000-0000-4000-8000-000000000001.webp')).toBe('00000000-0000-4000-8000-000000000001');
    expect(imageIdOf('site/projects/00000000-0000-4000-8000-00000000000A.webp')).toBeNull();
    expect(imageIdOf('site/projects/../x.webp')).toBeNull();
    expect(imageIdOf('otra/00000000-0000-4000-8000-000000000001.webp')).toBeNull();
  });

  it('extra: like the API, other image types (SVG anywhere in the first 1024 bytes, HEIC/AVIF, BMP, TIFF, ICO) are «unsupported» and anything else is not', () => {
    const text = (value: string) => new TextEncoder().encode(value);
    for (const unsupported of [text('<?xml version="1.0"?>\n<!-- x -->\n<svg/>'), bytes(0, 0, 0, 0x18, 'ftypavif'), bytes('BM'), bytes('II', 0x2a, 0), bytes('MM', 0, 0x2a), bytes(0, 0, 1, 0)]) {
      expect(isKnownUnsupported(unsupported)).toBe(true);
    }
    for (const other of [text('<!doctype html><title>x</title>'), bytes('%PDF-1.7'), bytes(0, 0, 0, 0x18, 'ftypisom'), text('BM'.slice(0, 1))]) {
      expect(isKnownUnsupported(other)).toBe(false);
    }
  });

  it('extra: parseUploaded keeps the six fields of a well-formed answer and refuses a bad key or size', () => {
    const good = { key: 'site/projects/00000000-0000-4000-8000-000000000001.png', url: 'https://media.example.test/x.png', contentType: 'image/png', bytes: 10, width: 2, height: 3, extra: 'x' };
    expect(parseUploaded(good)).toEqual({ key: good.key, url: good.url, contentType: 'image/png', bytes: 10, width: 2, height: 3 });
    expect(parseUploaded({ ...good, key: '../x.png' })).toBeNull();
    expect(parseUploaded({ ...good, width: 0 })).toBeNull();
    expect(parseUploaded(null)).toBeNull();
  });
});
