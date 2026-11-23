import type { CookieOptions, Request, Response } from "express";

import { parseCookies } from "../lib/cookies.js";
import { hashToken, OPAQUE_TOKEN_PATTERN } from "../lib/secrets.js";
import { CART_TTL_MS } from "../services/cart-store.js";
import type { CsrfSessionKey } from "./csrf.js";
import { panelCsrfSessionKey } from "./panel-auth.js";

/**
 * Sesión opaca del carrito de invitado (LN-06, RF-05). La cookie solo lleva un
 * token aleatorio de 256 bits; en la base se guarda su hash (carts.guest_token_hash).
 * No contiene líneas ni precios. En producción, __Host- obliga a Secure,
 * Path=/ y sin Domain.
 */
export const CART_COOKIE_DEV = "tk_carrito";
export const CART_COOKIE_PROD = "__Host-tk_carrito";

export function cartCookieName(isProduction: boolean): string {
  return isProduction ? CART_COOKIE_PROD : CART_COOKIE_DEV;
}

/** Token del carrito que trae la petición, o undefined si falta o no tiene el formato. */
export function cartToken(req: Request, isProduction: boolean): string | undefined {
  const value = parseCookies(req.headers.cookie)[cartCookieName(isProduction)];
  return value !== undefined && OPAQUE_TOKEN_PATTERN.test(value) ? value : undefined;
}

function cookieOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" };
}

/** Fija (o renueva) la cookie del carrito; dura lo mismo que el carrito en la base. */
export function setCartCookie(res: Response, token: string, isProduction: boolean): void {
  res.cookie(cartCookieName(isProduction), token, {
    ...cookieOptions(isProduction),
    maxAge: CART_TTL_MS,
  });
}

export function clearCartCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(cartCookieName(isProduction), cookieOptions(isProduction));
}

/**
 * Clave de sesión del CSRF (RNF-04): la del panel (LN-04) y, si existe, la del
 * carrito. Sin carrito queda idéntica a la del panel. Al crearse el carrito la
 * clave cambia, así que Next.js pide un token CSRF nuevo (como al ingresar al panel).
 */
export function storeCsrfSessionKey(isProduction: boolean): CsrfSessionKey {
  const panelKey = panelCsrfSessionKey(isProduction);
  return (req) => {
    const panel = panelKey(req);
    const token = cartToken(req, isProduction);
    return token ? `${panel}|carrito:${hashToken(token)}` : panel;
  };
}
