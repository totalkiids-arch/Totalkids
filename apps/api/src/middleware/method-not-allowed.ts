import type { RequestHandler } from "express";

import { AppError } from "../lib/errors.js";

/**
 * Cierra una ruta con 405 para los métodos no declarados:
 *
 *   router.route("/health").get(handler).all(methodNotAllowed("GET"));
 *
 * HEAD se acepta implícitamente donde hay GET (Express lo resuelve con el GET).
 */
export function methodNotAllowed(...allowed: string[]): RequestHandler {
  const methods = allowed.map((method) => method.toUpperCase());
  if (methods.includes("GET") && !methods.includes("HEAD")) methods.push("HEAD");
  const allow = methods.join(", ");
  return (req, res, next) => {
    res.setHeader("Allow", allow);
    next(
      new AppError(405, "METHOD_NOT_ALLOWED", `Método ${req.method} no permitido en esta ruta`, {
        allowed: methods,
      }),
    );
  };
}
