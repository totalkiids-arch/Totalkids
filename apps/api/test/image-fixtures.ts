/** Imágenes mínimas (solo encabezado) para probar la detección por bytes (LN-12). */

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u24le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** PNG con firma e IHDR. `padTo` agranda el archivo (para probar el tope de 2 MB). */
export function png(width: number, height: number, padTo = 0): Buffer {
  const header = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32be(13),
    ...ascii("IHDR"),
    ...u32be(width),
    ...u32be(height),
    8,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0, // CRC (no se verifica)
  ]);
  return padTo > header.length
    ? Buffer.concat([header, Buffer.alloc(padTo - header.length)])
    : header;
}

/** JPEG con APP0 y SOF0. */
export function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    ...ascii("JFIF"),
    0,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    0xc0,
    0x00,
    0x11,
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
    0xff,
    0xd9,
  ]);
}

/** WebP extendido (VP8X). */
export function webp(width: number, height: number): Buffer {
  return Buffer.from([
    ...ascii("RIFF"),
    30,
    0,
    0,
    0,
    ...ascii("WEBP"),
    ...ascii("VP8X"),
    10,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    ...u24le(width - 1),
    ...u24le(height - 1),
  ]);
}

/** WebP sin pérdida (VP8L). */
export function webpLossless(width: number, height: number): Buffer {
  const w = width - 1;
  const h = height - 1;
  return Buffer.from([
    ...ascii("RIFF"),
    26,
    0,
    0,
    0,
    ...ascii("WEBP"),
    ...ascii("VP8L"),
    5,
    0,
    0,
    0,
    0x2f,
    w & 0xff,
    ((w >> 8) & 0x3f) | ((h & 0x03) << 6),
    (h >> 2) & 0xff,
    (h >> 10) & 0x0f,
    0,
    0,
    0,
  ]);
}
