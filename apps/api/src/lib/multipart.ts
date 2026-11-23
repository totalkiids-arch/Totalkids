import type { Request } from "express";

import { AppError, errors } from "./errors.js";

/**
 * Lee un cuerpo multipart/form-data sin dependencias (LN-12): junta el cuerpo
 * con un tope de bytes y lo entrega a `Request.formData()` (undici, incluido en
 * Node). Solo lo usa la subida de imágenes del panel.
 *
 * - Si Content-Length ya supera el tope, responde 413 sin leer nada más.
 * - Si el cuerpo (p. ej. chunked) pasa el tope al leerlo, deja de guardarlo y
 *   descarta el resto hasta `drainLimit`; más allá corta la conexión.
 */
export interface MultipartOptions {
  /** Bytes máximos del cuerpo completo (archivo + campos). */
  maxBytes: number;
  /** Mensaje del 413. */
  tooLargeMessage: string;
}

function tooLarge(message: string): AppError {
  return new AppError(413, "PAYLOAD_TOO_LARGE", message);
}

/** Más allá de esto no vale la pena seguir descartando: se corta la conexión. */
const DRAIN_FACTOR = 4;

function readBody(req: Request, options: MultipartOptions): Promise<Buffer> {
  const drainLimit = options.maxBytes * DRAIN_FACTOR;
  const declared = Number(req.headers["content-length"]);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;
    const fail = (error: AppError) => {
      rejected = true;
      chunks.length = 0;
      reject(error);
    };
    // El resto del cuerpo se sigue leyendo y se descarta, así la respuesta 413
    // llega al cliente sin cortar la conexión.
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (rejected) {
        if (total > drainLimit) req.destroy();
        return;
      }
      if (total > options.maxBytes) fail(tooLarge(options.tooLargeMessage));
      else chunks.push(chunk);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks, total));
    });
    req.on("error", () => {
      if (!rejected) fail(errors.badRequest("La subida se interrumpió"));
    });
    req.on("close", () => {
      if (!rejected && !req.complete) fail(errors.badRequest("La subida se interrumpió"));
    });
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      fail(tooLarge(options.tooLargeMessage));
      if (declared > drainLimit) req.destroy();
    }
  });
}

export async function readMultipart(req: Request, options: MultipartOptions): Promise<FormData> {
  const body = await readBody(req, options);
  try {
    return await new globalThis.Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-type": req.headers["content-type"] ?? "" },
      body,
    }).formData();
  } catch {
    throw errors.badRequest("El formulario de la imagen no es válido");
  }
}
