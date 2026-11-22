import type { ErrorRequestHandler, RequestHandler } from "express";

import { AppError, errors, type ErrorBody } from "../lib/errors.js";

export const notFound: RequestHandler = (req, _res, next) => {
  next(errors.notFound(`Ruta no encontrada: ${req.method} ${req.path}`));
};

/** Forma de los errores que lanzan los parsers de Express (body-parser / raw-body). */
interface ParserError {
  type?: unknown;
  status?: unknown;
  body?: unknown;
}

/** Traduce errores de los parsers de cuerpo al catálogo; null si no es uno de ellos. */
function fromParserError(err: unknown): AppError | null {
  if (typeof err !== "object" || err === null) return null;
  const { type, status } = err as ParserError;
  switch (type) {
    case "entity.parse.failed":
      return errors.badRequest("El cuerpo de la solicitud no es JSON válido");
    case "entity.too.large":
      return new AppError(
        413,
        "PAYLOAD_TOO_LARGE",
        "El cuerpo de la solicitud es demasiado grande",
      );
    case "charset.unsupported":
    case "encoding.unsupported":
      return new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Codificación del cuerpo no soportada");
    default:
      // Otros errores 4xx de los parsers (petición abortada, demasiados parámetros, ...).
      if (typeof type === "string" && typeof status === "number" && status >= 400 && status < 500) {
        return errors.badRequest();
      }
      return null;
  }
}

/** Copia del error apta para el log: sin el cuerpo crudo que adjuntan los parsers. */
function forLog(err: unknown): unknown {
  if (err instanceof Error && "body" in err) {
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(err) as object),
      err,
    ) as Error & {
      body?: unknown;
    };
    copy.stack = err.stack;
    delete copy.body;
    return copy;
  }
  return err;
}

export interface ErrorHandlerOptions {
  /** En producción, los 5xx nunca exponen mensaje interno ni details. */
  isProduction: boolean;
}

export function createErrorHandler({ isProduction }: ErrorHandlerOptions): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    const appError = err instanceof AppError ? err : (fromParserError(err) ?? errors.internal());

    if (appError.status >= 500) {
      req.log.error({ err: forLog(err) }, appError.message);
    }

    const hide = isProduction && appError.status >= 500 && appError.code === "INTERNAL_ERROR";
    const body: ErrorBody = {
      code: appError.code,
      message: hide ? "Error interno del servidor" : appError.message,
      details: hide ? null : appError.details,
      requestId: String(req.id),
    };
    // Si la respuesta ya empezó, Express debe cerrar la conexión.
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(appError.status).json(body);
  };
}
