import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { hashToken, randomToken } from "../src/lib/secrets.js";
import {
  CART_COOKIE_DEV,
  CART_COOKIE_PROD,
  cartToken,
  storeCsrfSessionKey,
} from "../src/middleware/cart-session.js";
import { panelCsrfSessionKey, PANEL_COOKIE_DEV } from "../src/middleware/panel-auth.js";

const request = (cookie?: string) => ({ headers: { cookie } }) as unknown as Request;

describe("cartToken", () => {
  it("lee el token opaco de la cookie del carrito", () => {
    const token = randomToken();
    expect(cartToken(request(`${CART_COOKIE_DEV}=${token}`), false)).toBe(token);
    expect(cartToken(request(`${CART_COOKIE_PROD}=${token}`), true)).toBe(token);
  });

  it("ignora la cookie ausente, vacía o con otro formato (p. ej. el carrito antiguo en JSON)", () => {
    expect(cartToken(request(), false)).toBeUndefined();
    expect(cartToken(request(`${CART_COOKIE_DEV}=`), false)).toBeUndefined();
    const legacy = encodeURIComponent(JSON.stringify({ v: 1, l: [] }));
    expect(cartToken(request(`${CART_COOKIE_DEV}=${legacy}`), false)).toBeUndefined();
    // En producción solo vale la cookie con prefijo __Host-.
    expect(cartToken(request(`${CART_COOKIE_DEV}=${randomToken()}`), true)).toBeUndefined();
  });
});

describe("storeCsrfSessionKey", () => {
  const key = storeCsrfSessionKey(false);
  const panelKey = panelCsrfSessionKey(false);

  it("sin carrito, es exactamente la clave del panel (LN-04 no cambia)", () => {
    const panel = `${PANEL_COOKIE_DEV}=${randomToken()}`;
    expect(key(request(panel))).toBe(panelKey(request(panel)));
    expect(key(request())).toBe("");
  });

  it("con carrito, suma el hash del token del carrito", () => {
    const token = randomToken();
    expect(key(request(`${CART_COOKIE_DEV}=${token}`))).toBe(`|carrito:${hashToken(token)}`);
    const panelToken = randomToken();
    expect(key(request(`${PANEL_COOKIE_DEV}=${panelToken}; ${CART_COOKIE_DEV}=${token}`))).toBe(
      `${hashToken(panelToken)}|carrito:${hashToken(token)}`,
    );
  });

  it("otro carrito da otra clave: un token CSRF no sirve para otra sesión", () => {
    expect(key(request(`${CART_COOKIE_DEV}=${randomToken()}`))).not.toBe(
      key(request(`${CART_COOKIE_DEV}=${randomToken()}`)),
    );
  });
});
