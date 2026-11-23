import { Router } from "express";

import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import { getAdminOrder, listAdminOrders } from "../services/admin-orders/query.js";
import {
  adminOrdersQuery,
  orderParams,
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

  return router;
}
