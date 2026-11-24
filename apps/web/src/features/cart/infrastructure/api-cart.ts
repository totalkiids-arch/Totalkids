import "server-only";

import { cookies } from "next/headers";

import { apiFetch } from "@/shared/infrastructure/api-client";
import { requestContext } from "@/shared/infrastructure/request-context";

import {
  ApiCart,
  apiMessage,
  CART_UNITS_COOKIE,
  EMPTY_CART,
  toCartView,
  type CartView,
} from "../application/cart-view";

/**
 * Carrito del invitado en la API (LN-06), visto desde el servidor de Next.js
 * (LN-07). El navegador nunca llama a la API:
 *
 * - La cookie opaca del carrito (`tk_carrito`, `__Host-tk_carrito` en
 *   producción) la emite la API; Next la reenvía en cada llamada y copia al
 *   navegador el Set-Cookie que la API devuelve (HttpOnly).
 * - Las escrituras llevan CSRF de doble envío: Next pide el token a /csrf con
 *   la cookie del carrito, así queda atado a esa sesión.
 * - `tk_carrito_unidades` (no HttpOnly, solo un número) deja que el botón del
 *   encabezado muestre la cantidad sin volver dinámicas las páginas.
 */

const production = process.env.NODE_ENV === "production";
export const CART_COOKIE = production ? "__Host-tk_carrito" : "tk_carrito";
const MAX_AGE_FALLBACK = 60 * 60 * 24 * 30;

/** La API del carrito no respondió o respondió algo inesperado. */
export class CartUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("El carrito no está disponible", { cause });
    this.name = "CartUnavailableError";
  }
}

/** La API rechazó la operación (422/404) con un mensaje para el comprador. */
export class CartRejectedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CartRejectedError";
  }
}

async function cartToken(): Promise<string | undefined> {
  return (await cookies()).get(CART_COOKIE)?.value;
}

/** Cookie=valor de un Set-Cookie de la respuesta, con su Max-Age. */
function setCookieOf(response: Response, name: string) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair = "", ...attributes] = raw.split(";");
    const eq = pair.indexOf("=");
    if (pair.slice(0, eq).trim() !== name) continue;
    const maxAge = attributes
      .map((a) => a.trim().toLowerCase())
      .find((a) => a.startsWith("max-age="));
    return {
      value: pair.slice(eq + 1),
      maxAge: maxAge ? Number(maxAge.slice("max-age=".length)) : MAX_AGE_FALLBACK,
    };
  }
  return null;
}

async function csrfFor(cookieHeader: string, context: Awaited<ReturnType<typeof requestContext>>) {
  const response = await apiFetch("/api/v1/csrf", {
    ...context,
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  const { csrfToken } = (await response.json()) as { csrfToken?: unknown };
  if (typeof csrfToken !== "string") throw new Error("Respuesta de /csrf inválida");
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0] ?? "";
    if (pair.slice(pair.indexOf("=") + 1) === csrfToken) return { token: csrfToken, pair };
  }
  throw new Error("La API no entregó la cookie CSRF");
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Llama a una ruta del carrito. Las escrituras solo se hacen desde Server
 * Actions (pueden fijar cookies); allí se copian la cookie del carrito y la
 * cantidad de unidades al navegador.
 */
async function call(method: Method, path: `/${string}`, body?: unknown): Promise<CartView> {
  const context = await requestContext();
  const token = await cartToken();
  const cartCookie = token ? `${CART_COOKIE}=${token}` : "";

  let response: Response;
  try {
    const headers: Record<string, string> = {};
    if (method !== "GET") {
      const csrf = await csrfFor(cartCookie, context);
      headers.cookie = [cartCookie, csrf.pair].filter(Boolean).join("; ");
      headers["x-csrf-token"] = csrf.token;
      if (body !== undefined) headers["content-type"] = "application/json";
    } else if (cartCookie) {
      headers.cookie = cartCookie;
    }
    response = await apiFetch(`/api/v1${path}`, {
      ...context,
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    throw new CartUnavailableError(error);
  }

  const json: unknown = await response.json().catch(() => null);
  if (response.status === 404 || response.status === 422) {
    throw new CartRejectedError(
      apiMessage(json) ?? "No pudimos actualizar tu carrito.",
      response.status,
    );
  }
  if (!response.ok) throw new CartUnavailableError(`API ${response.status}`);
  const parsed = ApiCart.safeParse(json);
  if (!parsed.success) throw new CartUnavailableError(parsed.error);
  const view = toCartView(parsed.data);

  if (method !== "GET") await remember(response, view);
  return view;
}

/** Copia al navegador la cookie del carrito (si la API la emitió o renovó) y las unidades. */
async function remember(response: Response, view: CartView) {
  const jar = await cookies();
  const issued = setCookieOf(response, CART_COOKIE);
  const base = { path: "/", sameSite: "lax" as const, secure: production };
  if (issued)
    jar.set(CART_COOKIE, issued.value, { ...base, httpOnly: true, maxAge: issued.maxAge });
  jar.set(CART_UNITS_COOKIE, String(view.units), {
    ...base,
    httpOnly: false,
    maxAge: issued?.maxAge ?? MAX_AGE_FALLBACK,
  });
}

export const apiCart = {
  /** "tk_carrito=…" para otras rutas de la API que leen el carrito (checkout); "" sin carrito. */
  async sessionCookie(): Promise<string> {
    const token = await cartToken();
    return token ? `${CART_COOKIE}=${token}` : "";
  },
  /** Carrito vigente; sin cookie, vacío sin llamar a la API. */
  async read(): Promise<CartView> {
    if (!(await cartToken())) return EMPTY_CART;
    return call("GET", "/cart");
  },
  add(input: { sku: string; quantity: number; extras: string[]; texts: Record<string, string> }) {
    return call("POST", "/cart/items", input);
  },
  setQuantity(id: string, quantity: number) {
    return call("PATCH", `/cart/items/${encodeURIComponent(id)}`, { quantity });
  },
  remove(id: string) {
    return call("DELETE", `/cart/items/${encodeURIComponent(id)}`);
  },
  applyCoupon(code: string) {
    return call("POST", "/cart/coupon", { code });
  },
  removeCoupon() {
    return call("DELETE", "/cart/coupon");
  },
};
