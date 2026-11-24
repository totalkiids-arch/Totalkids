import { Router } from "express";

import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import { registerInvoice } from "../services/admin-orders/invoice.js";
import { getAdminOrder, listAdminOrders } from "../services/admin-orders/query.js";
import { recordRefund, resolveRefund } from "../services/admin-orders/refunds.js";
import {
  adminOrdersQuery,
  invoiceBody,
  orderParams,
  refundBody,
  refundParams,
  refundResolutionBody,
  statusChangeBody,
} from "../services/admin-orders/schemas.js";
import { changeOrderStatus } from "../services/admin-orders/status.js";
import { actorOf } from "../services/audit.js";

/**
 * Panel de pedidos (LN-13; RF-27, RF-32, RF-34). Detrás del `requirePanel` de
 * /admin. Pedidos, estados y factura: Administrador y Operador. Reembolsos:
 * solo Administrador (tabla de la API de la SRS). `{id}` es el uuid del pedido
 * o su número visible ("TK-1048").
 */
export function adminOrdersRouter(prisma: PrismaClient): Router {
  const router = Router();
  const staff = requireRole("admin", "operator");
  const adminOnly = requireRole("admin");

  router
    .route("/admin/orders")
    .get(
      staff,
      validated({ query: adminOrdersQuery }, async ({ query }, _req, res) => {
        res.json(await listAdminOrders(prisma, query));
      }),
    )
    .all(methodNotAllowed("GET"));

  router
    .route("/admin/orders/:id")
    .get(
      staff,
      validated({ params: orderParams }, async ({ params }, _req, res) => {
        res.json(await getAdminOrder(prisma, params.id));
      }),
    )
    .all(methodNotAllowed("GET"));

  router
    .route("/admin/orders/:id/status")
    .patch(
      staff,
      validated(
        { params: orderParams, body: statusChangeBody },
        async ({ params, body }, req, res) => {
          res.json(
            await changeOrderStatus(prisma, params.id, body, actorOf(req.panel), String(req.id)),
          );
        },
      ),
    )
    .all(methodNotAllowed("PATCH"));

  router
    .route("/admin/orders/:id/invoice")
    .post(
      staff,
      validated({ params: orderParams, body: invoiceBody }, async ({ params, body }, req, res) => {
        // Corregir un folio ya registrado es solo del Administrador (lo valida el servicio).
        const actor = actorOf(req.panel);
        const role = req.panel?.user.role ?? "operator";
        const result = await registerInvoice(prisma, params.id, body, actor, role, String(req.id));
        res.status(result.status).json(result.body);
      }),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/admin/orders/:id/refund-records")
    .post(
      adminOnly,
      validated({ params: orderParams, body: refundBody }, async ({ params, body }, req, res) => {
        res
          .status(201)
          .json(await recordRefund(prisma, params.id, body, actorOf(req.panel), String(req.id)));
      }),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/admin/orders/:id/refund-records/:refundId")
    .patch(
      adminOnly,
      validated(
        { params: refundParams, body: refundResolutionBody },
        async ({ params, body }, req, res) => {
          res.json(
            await resolveRefund(
              prisma,
              params.id,
              params.refundId,
              body.status,
              actorOf(req.panel),
              String(req.id),
            ),
          );
        },
      ),
    )
    .all(methodNotAllowed("PATCH"));

  return router;
}
