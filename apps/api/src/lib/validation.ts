import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { errors } from "./errors.js";

/** Mensajes de zod en español, aplicados en cada parse (no toca la config global). */
const spanish = z.locales.es();

export type InputLocation = "body" | "query" | "params";

/** Un problema de validación por campo, tal como viaja en `details.issues`. */
export interface ValidationIssue {
  location: InputLocation;
  /** Ruta con puntos, p. ej. "items.0.quantity". Vacía si el problema es del objeto entero. */
  path: string;
  message: string;
}

export interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

type Output<S extends Schemas, K extends keyof Schemas> = S[K] extends z.ZodType
  ? z.output<S[K]>
  : undefined;

/** Entrada ya validada y transformada que recibe el handler. */
export interface ValidatedInput<S extends Schemas> {
  body: Output<S, "body">;
  query: Output<S, "query">;
  params: Output<S, "params">;
}

export type ValidatedHandler<S extends Schemas> = (
  input: ValidatedInput<S>,
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

const LOCATIONS: InputLocation[] = ["params", "query", "body"];

function toIssues(location: InputLocation, error: z.ZodError): ValidationIssue[] {
  // Solo ruta y mensaje: nunca se devuelve el valor recibido.
  return error.issues.map((issue) => ({
    location,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/**
 * Valida body, query y params con zod antes del handler:
 *
 *   router.post("/newsletter", validated({ body: newsletterBody }, async ({ body }, _req, res) => {
 *     // body ya está parseado y tipado
 *   }));
 *
 * Si algo no pasa, responde 422 VALIDATION_ERROR con `details.issues` (todos los
 * campos con problemas, en español). Las partes sin esquema llegan como undefined.
 * Los errores (síncronos o promesas rechazadas) siguen al manejador de errores.
 */
export function validated<S extends Schemas>(
  schemas: S,
  handler: ValidatedHandler<S>,
): RequestHandler {
  return async (req, res, next) => {
    const input: Record<InputLocation, unknown> = {
      body: undefined,
      query: undefined,
      params: undefined,
    };
    const issues: ValidationIssue[] = [];

    for (const location of LOCATIONS) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = await schema.safeParseAsync(req[location], { error: spanish.localeError });
      if (result.success) input[location] = result.data;
      else issues.push(...toIssues(location, result.error));
    }

    if (issues.length > 0) {
      throw errors.validation("Los datos enviados no son válidos", { issues });
    }
    await handler(input as unknown as ValidatedInput<S>, req, res, next);
  };
}
