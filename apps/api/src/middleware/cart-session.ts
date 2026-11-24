import type { CookieOptions, Request, Response } from "express";

import { parseCookies } from "../lib/cookies.js";
import { hashToken, OPAQUE_TOKEN_PATTERN } from "../lib/secrets.js";
import type { CsrfSessionKey } from "./csrf.js";
import { panelCsrfSessionKey } from "./panel-auth.js";

/**
 * Cookie opaca del carrito del invitado (LN-06, SRS 4.4.2). Solo lleva un token
 * aleatorio; en la base queda su hash (`carts.guest_token_hash`). En producción,
 * __Host- obliga a Secure, Path=/ y sin Domain.
 */
export const CART_COOKIE_DEV = "tk_carrito";
export const CART_COOKIE_PROD = "__Host-tk_carrito";

export function cartCookieName(isProduction: boolean): string {
  return isProduction ? CART_COOKIE_PROD : CART_COOKIE_DEV;
}

/**
 * Token del carrito que trae la petición, o undefined. Un valor con otro formato
 * (p. ej. la cookie JSON que usaba la tienda antes de LN-07) se ignora.
 */
export function cartToken(req: Request, isProduction: boolean): string | undefined {
  const value = parseCookies(req.headers.cookie)[cartCookieName(isProduction)];
  return value !== undefined && OPAQUE_TOKEN_PATTERN.test(value) ? value : undefined;
}

function cookieOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" };
}

/** Fija (o renueva) la cookie del carrito con la vida de la expiración deslizante. */
export function setCartCookie(
  res: Response,
  token: string,
  isProduction: boolean,
  maxAgeMs: number,
): void {
  res.cookie(cartCookieName(isProduction), token, {
    ...cookieOptions(isProduction),
    maxAge: maxAgeMs,
  });
}

/** Clave CSRF de un token de carrito. El prefijo la separa de la del panel. */
export function cartSessionKeyOf(token: string): string {
  return `cart:${hashToken(token)}`;
}

/** Clave CSRF del carrito: `cart:<hash>` con cookie válida, o "" sin ella. */
export function cartCsrfSessionKey(isProduction: boolean): CsrfSessionKey {
  return (req) => {
    const token = cartToken(req, isProduction);
    return token ? cartSessionKeyOf(token) : "";
  };
}

/**
 * Clave CSRF de la API: la sesión del panel si existe (LN-04, sin cambios) y si
 * no, la del carrito (LN-06), o "" sin ninguna. No consulta la base.
 */
export function combinedCsrfSessionKey(isProduction: boolean): CsrfSessionKey {
  const panel = panelCsrfSessionKey(isProduction);
  const cart = cartCsrfSessionKey(isProduction);
  return (req) => panel(req) || cart(req);
}
