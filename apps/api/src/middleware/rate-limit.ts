import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { errors } from "../lib/errors.js";

const MINUTE = 60_000;

export interface RateLimiterOptions {
  /** Nombre corto de la política; aparece en las cabeceras RateLimit/RateLimit-Policy. */
  name: string;
  windowMs: number;
  /** Máximo de peticiones (o de fallos, con skipSuccessfulRequests) por ventana y clave. */
  limit: number;
  /** Clave del cliente. Por defecto, la IP real (req.ip respeta "trust proxy"). */
  keyGenerator?: (req: Request) => string;
  /** Cuenta solo las respuestas fallidas (status >= 400). Para login. */
  skipSuccessfulRequests?: boolean;
  /** Mensaje del 429. */
  message?: string;
}

/** Clave por IP, agrupando IPv6 por /56 para que no se evada rotando direcciones. */
export function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? "desconocida");
}

/**
 * Fábrica de limitadores con el formato de error de la API: 429 RATE_LIMITED,
 * cabeceras estándar `RateLimit` y `RateLimit-Policy` (draft-8) y `Retry-After`.
 *
 * Cada llamada crea su propio contador en memoria (por proceso). Si la API se
 * escala a varias instancias, hay que pasar a un almacén compartido.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const message = options.message ?? "Demasiadas solicitudes, intenta más tarde";
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    identifier: options.name,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    keyGenerator: options.keyGenerator ?? ipKey,
    handler: (_req, res, next) => {
      const retryAfterSeconds = Number(res.getHeader("Retry-After")) || null;
      next(errors.rateLimited(message, { retryAfterSeconds }));
    },
  });
}

export interface GlobalLimitConfig {
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
}

/** Límite global por IP para todo /api/v1 (RNF-04). Configurable por env. */
export function globalLimiter(config: GlobalLimitConfig): RequestHandler {
  return createRateLimiter({
    name: "global",
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
  });
}

/**
 * Formularios públicos (solicitudes de servicio, newsletter, consulta de pedido
 * de invitado): 10 envíos por IP cada 15 minutos. Crear uno por endpoint.
 */
export function publicFormLimiter(overrides: Partial<RateLimiterOptions> = {}): RequestHandler {
  return createRateLimiter({
    name: "public-form",
    windowMs: 15 * MINUTE,
    limit: 10,
    message: "Demasiados envíos desde esta conexión, intenta en unos minutos",
    ...overrides,
  });
}

/** Login del panel por IP: 20 intentos cada 15 minutos (cubre muchas cuentas desde una IP). */
export function loginIpLimiter(overrides: Partial<RateLimiterOptions> = {}): RequestHandler {
  return createRateLimiter({
    name: "login-ip",
    windowMs: 15 * MINUTE,
    limit: 20,
    message: "Demasiados intentos de ingreso, intenta en unos minutos",
    ...overrides,
  });
}

/** Correo normalizado del cuerpo de login; si no viene, cae en la IP. */
export function loginAccountKey(req: Request): string {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email === "string" && email.trim() !== "") {
    return `cuenta:${email.trim().toLowerCase()}`;
  }
  return `ip:${ipKey(req)}`;
}

/**
 * Regla RNF-04 para LN-04: 5 fallos de login por cuenta cada 15 minutos. Solo
 * cuentan las respuestas con status >= 400; un ingreso correcto no consume cupo.
 * Montar después del parser JSON y antes de validar:
 *
 *   router.post("/auth/login", loginIpLimiter(), loginAccountLimiter(), validated(...))
 */
export function loginAccountLimiter(overrides: Partial<RateLimiterOptions> = {}): RequestHandler {
  return createRateLimiter({
    name: "login-account",
    windowMs: 15 * MINUTE,
    limit: 5,
    skipSuccessfulRequests: true,
    keyGenerator: loginAccountKey,
    message: "Demasiados intentos fallidos para esta cuenta, intenta en 15 minutos",
    ...overrides,
  });
}
