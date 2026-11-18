import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

export const REQUEST_ID_HEADER = "x-request-id";
const VALID_REQUEST_ID = /^[\w-]{1,128}$/;

/**
 * Reutiliza el X-Request-Id entrante (p. ej. generado por Next.js) si es válido,
 * o genera uno nuevo. Lo expone en req.id y en la cabecera de respuesta.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};
