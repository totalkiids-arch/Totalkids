import type { Request } from "express";
import { describe, expect, it } from "vitest";

import {
  CART_COOKIE_DEV,
  CART_COOKIE_PROD,
  cartToken,
  combinedCsrfSessionKey,
} from "../src/middleware/cart-session.js";
import { PANEL_COOKIE_DEV } from "../src/middleware/panel-auth.js";
import { hashToken, randomToken } from "../src/lib/secrets.js";
import { parseEnv } from "../src/config/env.js";

const req = (cookie?: string) => ({ headers: { cookie } }) as unknown as Request;

describe("sesión del carrito (LN-06)", () => {
  it("solo acepta tokens opacos en la cookie", () => {
    const token = randomToken();
    expect(cartToken(req(`${CART_COOKIE_DEV}=${token}`), false)).toBe(token);
    expect(cartToken(req(`${CART_COOKIE_PROD}=${token}`), true)).toBe(token);
    expect(cartToken(req(`${CART_COOKIE_DEV}=${token}`), true)).toBeUndefined();
    // La cookie JSON que usaba la tienda antes de LN-07 se ignora.
    const legacy = encodeURIComponent(JSON.stringify({ v: 1, l: [] }));
    expect(cartToken(req(`${CART_COOKIE_DEV}=${legacy}`), false)).toBeUndefined();
    expect(cartToken(req(), false)).toBeUndefined();
  });

  it("clave CSRF: panel si hay sesión, si no carrito, si no vacía", () => {
    const key = combinedCsrfSessionKey(false);
    const panel = randomToken();
    const cart = randomToken();
    expect(key(req())).toBe("");
    expect(key(req(`${CART_COOKIE_DEV}=${cart}`))).toBe(`cart:${hashToken(cart)}`);
    // Con sesión del panel la clave es exactamente la de LN-04.
    expect(key(req(`${PANEL_COOKIE_DEV}=${panel}`))).toBe(hashToken(panel));
    expect(key(req(`${PANEL_COOKIE_DEV}=${panel}; ${CART_COOKIE_DEV}=${cart}`))).toBe(
      hashToken(panel),
    );
  });

  it("CART_TTL_DAYS: 30 por defecto, entre 1 y 90", () => {
    const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };
    expect(parseEnv(base).data?.CART_TTL_DAYS).toBe(30);
    expect(parseEnv({ ...base, CART_TTL_DAYS: "7" }).data?.CART_TTL_DAYS).toBe(7);
    expect(parseEnv({ ...base, CART_TTL_DAYS: "0" }).success).toBe(false);
    expect(parseEnv({ ...base, CART_TTL_DAYS: "91" }).success).toBe(false);
  });
});
