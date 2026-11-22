import type { Request, RequestHandler } from "express";

import { parseCookies } from "../lib/cookies.js";
import { CSRF_HEADER, csrfCookieName, safeEqual, verifyCsrfToken } from "../lib/csrf.js";
import { errors } from "../lib/errors.js";

/** Devuelve el identificador de la sesión actual (panel o carrito), o "" si no hay. */
export type CsrfSessionKey = (req: Request) => string;

export interface CsrfOptions {
  secret: string;
  isProduction: boolean;
  /** Orígenes del sitio (CORS_ORIGINS). Un Origin distinto se rechaza. */
  allowedOrigins: readonly string[];
  /** LN-04 (sesión del panel) y LN-06 (carrito) lo conectan con su cookie opaca. */
  sessionKey: CsrfSessionKey;
  /** Rutas relativas al router exentas (callbacks de Flow). */
  isExempt: (path: string) => boolean;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Protección CSRF de doble envío firmado para POST/PUT/PATCH/DELETE (RNF-04).
 * Exige que la cabecera X-CSRF-Token y la cookie tk_csrf sean iguales y que la
 * firma sea válida para la sesión actual; si no, 403 CSRF_FAILED.
 *
 * Los callbacks de Flow están exentos: Flow no tiene sesión ni token. Esas rutas
 * no tienen autoridad para acreditar pagos por sí solas (consultan a Flow).
 */
export function csrfProtection(options: CsrfOptions): RequestHandler {
  const cookieName = csrfCookieName(options.isProduction);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || options.isExempt(req.path)) {
      next();
      return;
    }

    // Capa extra: el navegador nunca debería llamar a la API directo desde otro sitio.
    const origin = req.get("origin");
    if (origin !== undefined && !options.allowedOrigins.includes(origin)) {
      next(errors.csrfFailed("Origen no permitido"));
      return;
    }

    const header = req.get(CSRF_HEADER);
    const cookie = parseCookies(req.headers.cookie)[cookieName];
    if (!header || !cookie) {
      next(errors.csrfFailed("Falta el token de seguridad del formulario"));
      return;
    }
    if (
      !safeEqual(header, cookie) ||
      !verifyCsrfToken(options.secret, cookie, options.sessionKey(req))
    ) {
      next(errors.csrfFailed());
      return;
    }
    next();
  };
}
