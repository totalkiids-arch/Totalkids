import type { CookieOptions, Request, RequestHandler, Response } from "express";

import type { UserRole } from "../generated/prisma/enums.js";
import { parseCookies } from "../lib/cookies.js";
import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { hashToken } from "../lib/secrets.js";
import { resolveSession, SESSION_TTL_MS } from "../services/auth.js";

/** Cookie de la sesión del panel. En producción, __Host- obliga a Secure, Path=/ y sin Domain. */
export const PANEL_COOKIE_DEV = "tk_panel";
export const PANEL_COOKIE_PROD = "__Host-tk_panel";

export function panelCookieName(isProduction: boolean): string {
  return isProduction ? PANEL_COOKIE_PROD : PANEL_COOKIE_DEV;
}

/** Token de sesión del panel que trae la petición, o undefined. */
export function panelToken(req: Request, isProduction: boolean): string | undefined {
  const value = parseCookies(req.headers.cookie)[panelCookieName(isProduction)];
  return value === "" ? undefined : value;
}

function cookieOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" };
}

export function setPanelCookie(res: Response, token: string, isProduction: boolean): void {
  res.cookie(panelCookieName(isProduction), token, {
    ...cookieOptions(isProduction),
    maxAge: SESSION_TTL_MS,
  });
}

export function clearPanelCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(panelCookieName(isProduction), cookieOptions(isProduction));
}

/**
 * Clave de sesión para atar el token CSRF (SRS RNF-04): el hash del token del
 * panel, o "" sin sesión. Al ingresar cambia, así que Next.js pide un CSRF nuevo.
 */
export function panelCsrfSessionKey(isProduction: boolean) {
  return (req: Request): string => {
    const token = panelToken(req, isProduction);
    return token ? hashToken(token) : "";
  };
}

/**
 * Exige una sesión vigente del panel y, si se indican, uno de los roles. Deja la
 * sesión en `req.panel`. 401 sin sesión válida; 403 con un rol no permitido.
 *
 *   router.get("/admin/reports/sales", requirePanel(prisma, isProd, "admin"), handler)
 */
export function requirePanel(
  prisma: Pick<PrismaClient, "session">,
  isProduction: boolean,
  ...roles: UserRole[]
): RequestHandler {
  return async (req, _res, next) => {
    if (!req.panel) {
      const token = panelToken(req, isProduction);
      const session = token ? await resolveSession(prisma, token) : null;
      if (!session) throw errors.unauthorized("Debes iniciar sesión en el panel");
      req.panel = session;
    }
    if (roles.length > 0 && !roles.includes(req.panel.user.role)) {
      throw errors.forbidden();
    }
    next();
  };
}

/** Exige un rol sobre una sesión ya cargada por `requirePanel` (p. ej. en /admin). */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.panel) throw errors.unauthorized("Debes iniciar sesión en el panel");
    if (!roles.includes(req.panel.user.role)) throw errors.forbidden();
    next();
  };
}
