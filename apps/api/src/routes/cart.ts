import { type Request, type Response, Router } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import { csrfCookieName, issueCsrfToken } from "../lib/csrf.js";
import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { cartSessionKeyOf, cartToken, setCartCookie } from "../middleware/cart-session.js";
import type { CsrfSessionKey } from "../middleware/csrf.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { panelCsrfSessionKey } from "../middleware/panel-auth.js";
import {
  addItem,
  applyCoupon,
  LINE_NOT_FOUND,
  readCart,
  removeCoupon,
  removeItem,
  updateItem,
  writeCart,
} from "../services/cart/cart.js";
import { MAX_QUANTITY_PER_LINE } from "../services/cart/pricing.js";
import { createCart, findCart, touchCart } from "../services/cart/session.js";

export interface CartRouterOptions {
  prisma: PrismaClient;
  isProduction: boolean;
  /** Vida del carrito sin uso (CART_TTL_DAYS), en ms. */
  ttlMs: number;
  csrfSecret: string;
  sessionKey: CsrfSessionKey;
}

const quantity = z
  .number()
  .int()
  .min(1, `Elige entre 1 y ${String(MAX_QUANTITY_PER_LINE)} unidades.`)
  .max(MAX_QUANTITY_PER_LINE, `Elige entre 1 y ${String(MAX_QUANTITY_PER_LINE)} unidades.`);

const addBody = z.object({
  sku: z.string().trim().min(1).max(60),
  quantity,
  /** Códigos de los extras elegidos («armado», «nombre»). */
  extras: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  /** Texto de cada extra personalizable, por código. */
  texts: z.record(z.string().max(40), z.string().max(200)).default({}),
});

const lineParams = z.object({ id: z.string().max(64) });
const updateBody = z.object({ quantity });
const couponBody = z.object({ code: z.string().max(60) });

/** Formato de los ids de línea; otro valor no puede existir (404, como uno ajeno). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Carrito del invitado (LN-06, RF-05 a RF-08). Solo el carrito propio: la
 * cookie opaca `tk_carrito` lo identifica y nunca se recibe un id de carrito.
 */
export function cartRouter(options: CartRouterOptions): Router {
  const { prisma, isProduction, ttlMs } = options;
  const panelKey = panelCsrfSessionKey(isProduction);
  const router = Router();

  /** Carrito vigente de la cookie, extendiendo su vida si corresponde. */
  async function currentCart(req: Request, res: Response) {
    const token = cartToken(req, isProduction);
    const cart = token ? await findCart(prisma, token) : null;
    if (token && cart && (await touchCart(prisma, cart, ttlMs))) {
      setCartCookie(res, token, isProduction, ttlMs);
    }
    return cart;
  }

  /**
   * Carrito vigente o uno nuevo. Al crearlo cambia la clave de sesión CSRF, así
   * que en la misma respuesta va un token nuevo (cookie + cabecera X-CSRF-Token)
   * y Next.js no necesita volver a pedir /csrf.
   */
  async function cartForWrite(req: Request, res: Response) {
    const existing = await currentCart(req, res);
    if (existing) return existing;
    const { cart, token } = await createCart(prisma, ttlMs);
    setCartCookie(res, token, isProduction, ttlMs);
    const key = panelKey(req) || cartSessionKeyOf(token);
    if (key !== options.sessionKey(req)) {
      const csrfToken = issueCsrfToken(options.csrfSecret, key);
      res.cookie(csrfCookieName(isProduction), csrfToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
      });
      res.setHeader("X-CSRF-Token", csrfToken);
    }
    return cart;
  }

  router
    .route("/cart")
    .get(async (req, res) => {
      const cart = await currentCart(req, res);
      res.json(await readCart(prisma, cart?.id ?? null));
    })
    .all(methodNotAllowed("GET"));

  router
    .route("/cart/items")
    .post(
      validated({ body: addBody }, async ({ body }, req, res) => {
        const cart = await cartForWrite(req, res);
        const view = await writeCart(prisma, cart.id, (tx) => addItem(tx, cart.id, body));
        res.status(201).json(view);
      }),
    )
    .all(methodNotAllowed("POST"));

  /** Escritura sobre una línea del carrito propio; sin carrito o id inválido, 404. */
  async function lineWrite(
    req: Request,
    res: Response,
    rawId: string,
    operation: (tx: Prisma.TransactionClient, cartId: string, id: string) => Promise<void>,
  ) {
    const cart = await currentCart(req, res);
    if (!cart || !UUID.test(rawId)) throw errors.notFound(LINE_NOT_FOUND);
    res.json(await writeCart(prisma, cart.id, (tx) => operation(tx, cart.id, rawId)));
  }

  router
    .route("/cart/items/:id")
    .patch(
      validated({ params: lineParams, body: updateBody }, ({ params, body }, req, res) =>
        lineWrite(req, res, params.id, (tx, cartId, id) =>
          updateItem(tx, cartId, id, body.quantity),
        ),
      ),
    )
    .delete(
      validated({ params: lineParams }, ({ params }, req, res) =>
        lineWrite(req, res, params.id, removeItem),
      ),
    )
    .all(methodNotAllowed("PATCH", "DELETE"));

  router
    .route("/cart/coupon")
    .post(
      validated({ body: couponBody }, async ({ body }, req, res) => {
        const cart = await currentCart(req, res);
        // Sin carrito no hay a qué aplicarlo: mismas validaciones, sin crear filas.
        const cartId = cart?.id ?? null;
        if (!cartId) {
          await applyCoupon(prisma, null, body.code); // siempre responde 422
          return;
        }
        res.json(await writeCart(prisma, cartId, (tx) => applyCoupon(tx, cartId, body.code)));
      }),
    )
    .delete(async (req, res) => {
      const cart = await currentCart(req, res);
      if (!cart) {
        res.json(await readCart(prisma, null));
        return;
      }
      res.json(await writeCart(prisma, cart.id, (tx) => removeCoupon(tx, cart.id)));
    })
    .all(methodNotAllowed("POST", "DELETE"));

  return router;
}
