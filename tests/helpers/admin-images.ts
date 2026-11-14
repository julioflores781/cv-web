/**
 * Minimal test images, generated in memory (no real pictures in the repo): a valid header of the format with its dimensions, padded with
 * zeros up to the requested size. Enough for magic-byte sniffing and the dimension parser of the fake API.
 */
export type FakeImageKind = 'png' | 'gif' | 'jpg' | 'webp';

function header(kind: FakeImageKind, width: number, height: number): Uint8Array {
  const buffer = Buffer.alloc(32);
  switch (kind) {
    case 'png':
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
      buffer.writeUInt32BE(13, 8);
      buffer.write('IHDR', 12, 'latin1');
      buffer.writeUInt32BE(width, 16);
      buffer.writeUInt32BE(height, 20);
      return buffer.subarray(0, 24);
    case 'gif':
      buffer.write('GIF89a', 0, 'latin1');
      buffer.writeUInt16LE(width, 6);
      buffer.writeUInt16LE(height, 8);
      return buffer.subarray(0, 13);
    case 'webp':
      buffer.write('RIFF', 0, 'latin1');
      buffer.writeUInt32LE(22, 4);
      buffer.write('WEBPVP8X', 8, 'latin1');
      buffer.writeUInt32LE(10, 16);
      buffer.writeUIntLE(width - 1, 24, 3);
      buffer.writeUIntLE(height - 1, 27, 3);
      return buffer.subarray(0, 30);
    case 'jpg':
      // SOI, then a SOF0 segment: length 17, precision 8, height, width.
      Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]).copy(buffer, 0);
      buffer.writeUInt16BE(height, 7);
      buffer.writeUInt16BE(width, 9);
      return buffer.subarray(0, 21);
  }
}

/** `size` bytes of a `kind` image of `width`×`height`; at least the header. Byte `i` of the padding is `i % 251`, so hashes notice a cut. */
export function fakeImage(kind: FakeImageKind, size: number, width = 640, height = 360): Uint8Array<ArrayBuffer> {
  const head = header(kind, width, height);
  const out = new Uint8Array(Math.max(size, head.byteLength));
  out.set(head, 0);
  for (let i = head.byteLength; i < out.byteLength; i += 1) out[i] = i % 251;
  return out;
}
