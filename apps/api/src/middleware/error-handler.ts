import type { ErrorRequestHandler, RequestHandler } from "express";

import { AppError, type ErrorBody } from "../lib/errors.js";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", `Ruta no encontrada: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const appError =
    err instanceof AppError
      ? err
      : new AppError(500, "INTERNAL_ERROR", "Error interno del servidor");

  if (appError.status >= 500) {
    req.log.error({ err }, appError.message);
  }

  const body: ErrorBody = {
    code: appError.code,
    message: appError.message,
    details: appError.details,
    requestId: String(req.id),
  };
  res.status(appError.status).json(body);
};
