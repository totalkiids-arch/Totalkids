import { Router } from "express";
import { z } from "zod";

import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { cartToken } from "../middleware/cart-session.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { readCart } from "../services/cart/cart.js";
import { findCart } from "../services/cart/session.js";
import type { ShippingQuoter } from "../services/shipping/quoter.js";

const quoteQuery = z
  .object({
    method: z.enum(["despacho", "retiro"]),
    region: z.string().trim().min(1).max(4).optional(),
    commune: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((query, ctx) => {
    if (query.method !== "despacho") return;
    if (!query.region)
      ctx.addIssue({ code: "custom", path: ["region"], message: "Elige tu región" });
    if (!query.commune) {
      ctx.addIssue({ code: "custom", path: ["commune"], message: "Elige tu comuna" });
    }
  });

/**
 * GET /shipping/quote (RF-08, RF-11): cotiza la entrega del carrito propio con
 * el puerto `ShippingQuoter`. El despacho gratis se calcula sobre el subtotal
 * elegible − descuento; el despacho nunca recibe descuento. Sin carrito, la
 * base es 0. No crea ni modifica nada.
 */
export function shippingRouter(options: {
  prisma: PrismaClient;
  isProduction: boolean;
  quoter: ShippingQuoter;
}): Router {
  const { prisma, isProduction, quoter } = options;
  const router = Router();

  router
    .route("/shipping/quote")
    .get(
      validated({ query: quoteQuery }, async ({ query }, req, res) => {
        const token = cartToken(req, isProduction);
        const cart = token ? await findCart(prisma, token) : null;
        const { totals } = await readCart(prisma, cart?.id ?? null);
        const quote = await quoter.quote({
          ...query,
          amountAfterDiscount: totals.totalWithoutShipping,
        });
        if (!quote) {
          throw errors.validation("El retiro en taller no está disponible por ahora.", {
            issues: [
              {
                location: "query",
                path: "method",
                message: "El retiro en taller no está disponible por ahora.",
              },
            ],
          });
        }
        res.json({
          ...quote,
          totals: {
            subtotal: totals.subtotal,
            discount: totals.discount,
            shipping: quote.cost,
            // Una tarifa por confirmar no se suma (RF-11).
            total: totals.totalWithoutShipping + (quote.cost ?? 0),
          },
        });
      }),
    )
    .all(methodNotAllowed("GET"));

  return router;
}
