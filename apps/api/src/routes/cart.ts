import { Router } from "express";
import { z } from "zod";

import { MAX_QUANTITY_PER_SKU } from "../domain/cart.js";
import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { cartToken, setCartCookie } from "../middleware/cart-session.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { addItem, getCart, removeItem, updateItem } from "../services/cart.js";

const extraChoice = z.object({
  code: z.string().trim().min(1).max(40),
  text: z.string().max(200).nullish(),
});

const addBody = z.object({
  sku: z.string().trim().min(1).max(60),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_SKU),
  extras: z.array(extraChoice).max(10).default([]),
});

const updateBody = z.object({
  quantity: z.number().int().min(0).max(MAX_QUANTITY_PER_SKU),
});

// Un id mal formado no puede ser una línea del carrito: 404 igual que uno inexistente.
const lineParams = z.object({ id: z.string().max(60) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Carrito de invitado (LN-06, RF-05 a RF-08). La sesión es la cookie opaca
 * tk_carrito; no hay cuentas de comprador. Las modificaciones exigen CSRF
 * (middleware global) y renuevan la cookie.
 */
export function cartRouter({
  prisma,
  isProduction,
}: {
  prisma: PrismaClient;
  isProduction: boolean;
}): Router {
  const router = Router();

  router
    .route("/cart")
    .get(async (req, res) => {
      res.json(await getCart(prisma, cartToken(req, isProduction)));
    })
    .all(methodNotAllowed("GET"));

  router
    .route("/cart/items")
    .post(
      validated({ body: addBody }, async ({ body }, req, res) => {
        const token = cartToken(req, isProduction);
        const { cart, newToken } = await addItem(prisma, token, body);
        const current = newToken ?? token;
        if (current) setCartCookie(res, current, isProduction);
        res.status(201).json(cart);
      }),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/cart/items/:id")
    .patch(
      validated({ params: lineParams, body: updateBody }, async ({ params, body }, req, res) => {
        if (!UUID.test(params.id)) throw errors.notFound("Esa línea ya no está en tu carrito");
        const token = cartToken(req, isProduction);
        const cart = await updateItem(prisma, token, params.id, body.quantity);
        if (token) setCartCookie(res, token, isProduction);
        res.json(cart);
      }),
    )
    .delete(
      validated({ params: lineParams }, async ({ params }, req, res) => {
        if (!UUID.test(params.id)) throw errors.notFound("Esa línea ya no está en tu carrito");
        const token = cartToken(req, isProduction);
        const cart = await removeItem(prisma, token, params.id);
        if (token) setCartCookie(res, token, isProduction);
        res.json(cart);
      }),
    )
    .all(methodNotAllowed("PATCH", "DELETE"));

  return router;
}
