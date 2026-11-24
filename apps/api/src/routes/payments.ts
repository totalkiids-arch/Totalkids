import { Router } from "express";
import { z } from "zod";

import { formatOrderNumber } from "../domain/checkout.js";
import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { PrismaClient } from "../lib/prisma.js";
import { hashToken } from "../lib/secrets.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { FlowRejectedError } from "../services/flow/client.js";
import { settlePayment, type SettleResult } from "../services/flow/settle.js";
import { startPayment, type FlowGateway } from "../services/flow/start.js";

const createBody = z.object({ orderNumber: z.string().trim().min(1).max(20) });
const callbackBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/) });

/**
 * Pagos con Flow (LN-10). Confirmación y retorno son públicos, pero no acreditan
 * nada por sí solos: la API consulta a Flow con sus credenciales (RF-16, RF-17).
 * Los logs nunca llevan el token.
 */
export function paymentsRouter(deps: {
  prisma: PrismaClient;
  logger: Logger;
  /** null: Flow sin configurar. */
  flow: FlowGateway | null;
  accessSecret: string;
  adminEmail: string;
  siteUrl: string;
}): Router {
  const { prisma, logger, flow, accessSecret, adminEmail, siteUrl } = deps;
  const router = Router();

  async function verify(token: string, gateway: FlowGateway): Promise<SettleResult> {
    const status = await gateway.client.getStatus(token);
    return settlePayment(prisma, { status, token, adminEmail });
  }

  router
    .route("/payments/flow/create")
    .post(
      validated({ body: createBody }, async ({ body: { orderNumber } }, req, res) => {
        const credential = req.get("x-order-access");
        if (!credential) {
          throw errors.unauthorized("Falta la credencial del pedido (X-Order-Access)");
        }
        if (!flow) {
          throw errors.conflict("El pago no está disponible por ahora.", {
            reason: "payment_unavailable",
          });
        }
        res.json(
          await startPayment(prisma, flow, { orderNumber, credential, accessSecret, adminEmail }),
        );
      }),
    )
    .all(methodNotAllowed("POST"));

  // 200 solo con el resultado ya guardado; si algo falla, error para que Flow reintente.
  router
    .route("/payments/flow/confirm")
    .post(
      validated({ body: callbackBody }, async ({ body: { token } }, _req, res) => {
        if (!flow) throw errors.internal();
        try {
          const { outcome, orderNumber } = await verify(token, flow);
          logger.info({ outcome, orderNumber }, "Confirmación de Flow procesada");
        } catch (error) {
          // Token que Flow no reconoce y que tampoco es nuestro: no hay nada que recuperar.
          const ignorable =
            error instanceof FlowRejectedError &&
            error.httpStatus === 400 &&
            (await prisma.payment.count({ where: { tokenHash: hashToken(token) } })) === 0;
          if (!ignorable) throw error;
          logger.warn("Confirmación de Flow con un token desconocido");
        }
        res.status(200).end();
      }),
    )
    .all(methodNotAllowed("POST"));

  // Volver de Flow no acredita el pago: verifica si puede y redirige a la tienda.
  router
    .route("/payments/flow/return")
    .post(async (req, res) => {
      const parsed = callbackBody.safeParse(req.body);
      let orderNumber: string | null = null;
      if (flow && parsed.success) {
        try {
          ({ orderNumber } = await verify(parsed.data.token, flow));
        } catch (error) {
          logger.warn(
            { reason: error instanceof Error ? error.name : "desconocido" },
            "No se pudo verificar el pago en el retorno",
          );
          const known = await prisma.payment
            .findUnique({
              where: { tokenHash: hashToken(parsed.data.token) },
              select: { order: { select: { number: true } } },
            })
            .catch(() => null);
          if (known) orderNumber = formatOrderNumber(known.order.number);
        }
      }
      const query = orderNumber ? `?pedido=${orderNumber}` : "";
      res.redirect(303, `${siteUrl}/checkout/resultado${query}`);
    })
    .all(methodNotAllowed("POST"));

  return router;
}
