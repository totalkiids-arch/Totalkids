import express, { type RequestHandler } from "express";

import { AppError } from "../lib/errors.js";

/**
 * Callbacks de Flow (SRS 4.4.1 y 4.4.2): son las únicas rutas que aceptan
 * formularios (application/x-www-form-urlencoded) y las únicas exentas de CSRF
 * de sesión. No tienen autoridad para acreditar pagos: solo reciben el token y
 * la API consulta el estado real a Flow (RNF-04, RF-16). Rutas relativas a /api/v1.
 */
export const FLOW_CALLBACK_PATHS = ["/payments/flow/confirm", "/payments/flow/return"] as const;

/** Límite del cuerpo JSON. Las imágenes no viajan como JSON (PR-05). */
export const JSON_BODY_LIMIT = "100kb";
/** Los callbacks de Flow solo traen `token`. */
export const FORM_BODY_LIMIT = "16kb";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isFlowCallbackPath(path: string): boolean {
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return (FLOW_CALLBACK_PATHS as readonly string[]).includes(normalized);
}

/** true si la petición declara un cuerpo (Content-Length > 0 o Transfer-Encoding). */
function hasBody(req: Parameters<RequestHandler>[0]): boolean {
  if (req.headers["transfer-encoding"] !== undefined) return true;
  const length = Number(req.headers["content-length"] ?? 0);
  return Number.isFinite(length) && length > 0;
}

/**
 * 415 si un método que modifica trae cuerpo con un Content-Type no permitido:
 * JSON en todas las rutas; formulario solo en los callbacks de Flow. Un POST sin
 * cuerpo (p. ej. logout) no necesita Content-Type. Montar bajo /api/v1.
 */
export const requireContentType: RequestHandler = (req, _res, next) => {
  if (!METHODS_WITH_BODY.has(req.method) || !hasBody(req)) {
    next();
    return;
  }
  const flow = isFlowCallbackPath(req.path);
  const allowed = flow ? "application/x-www-form-urlencoded" : "application/json";
  if (req.is(allowed)) {
    next();
    return;
  }
  next(
    new AppError(415, "UNSUPPORTED_MEDIA_TYPE", `El cuerpo debe enviarse como ${allowed}`, {
      allowed: [allowed],
    }),
  );
};

/** Parsers de cuerpo de /api/v1: formulario solo en Flow, JSON en el resto. */
export function bodyParsers(): RequestHandler[] {
  const form = express.urlencoded({ extended: false, limit: FORM_BODY_LIMIT });
  const json = express.json({ limit: JSON_BODY_LIMIT });
  return [
    (req, res, next) => (isFlowCallbackPath(req.path) ? form(req, res, next) : next()),
    (req, res, next) => (isFlowCallbackPath(req.path) ? next() : json(req, res, next)),
  ];
}
