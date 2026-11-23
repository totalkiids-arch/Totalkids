/**
 * Reconoce una imagen por sus bytes iniciales (firma), no por la extensión ni
 * por el tipo que declara el navegador (RF-26: archivos permitidos). Solo JPG,
 * PNG y WebP. También lee el ancho y alto del encabezado cuando puede.
 */

export type ImageFormat = "jpeg" | "png" | "webp";

export interface DetectedImage {
  format: ImageFormat;
  extension: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
  /** null si el encabezado no permite leerlo; nunca 0 (CHECK product_images_size_positive). */
  width: number | null;
  height: number | null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Tope razonable para descartar encabezados corruptos. */
const MAX_SIDE = 20_000;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => u16be(b, i) * 0x10000 + u16be(b, i + 2);

function size(width: number, height: number): { width: number | null; height: number | null } {
  const ok = (n: number) => Number.isInteger(n) && n > 0 && n <= MAX_SIDE;
  return ok(width) && ok(height) ? { width, height } : { width: null, height: null };
}

/** Marcadores SOF de JPEG que traen el tamaño (excluye DHT C4, JPG C8 y DAC CC). */
const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegSize(b: Uint8Array) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // relleno
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // sin largo
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // fin o inicio de los datos
    if (JPEG_SOF.has(marker)) return size(u16be(b, i + 7), u16be(b, i + 5));
    i += 2 + u16be(b, i + 2);
  }
  return { width: null, height: null };
}

function webpSize(b: Uint8Array) {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 " && startsWith(b, [0x9d, 0x01, 0x2a], 23)) {
    return size(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = b.subarray(21, 25);
    return size(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6)));
  }
  if (chunk === "VP8X") return size(1 + u24le(b, 24), 1 + u24le(b, 27));
  return { width: null, height: null };
}

/** Formato y tamaño de la imagen, o null si no es JPG, PNG ni WebP. */
export function detectImage(bytes: Uint8Array): DetectedImage | null {
  if (startsWith(bytes, PNG_SIGNATURE) && bytes.length >= 24) {
    const dims = ascii(bytes, 12, 4) === "IHDR" ? size(u32be(bytes, 16), u32be(bytes, 20)) : null;
    return {
      format: "png",
      extension: "png",
      contentType: "image/png",
      ...(dims ?? { width: null, height: null }),
    };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { format: "jpeg", extension: "jpg", contentType: "image/jpeg", ...jpegSize(bytes) };
  }
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { format: "webp", extension: "webp", contentType: "image/webp", ...webpSize(bytes) };
  }
  return null;
}
