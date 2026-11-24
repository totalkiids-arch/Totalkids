import { Router } from "express";

import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import {
  followUpBody,
  requestListQuery,
  requestParams,
  subscriberListQuery,
  subscriberParams,
} from "../services/admin-desk/schemas.js";
import {
  followUpRequest,
  getAdminRequest,
  listAdminRequests,
} from "../services/admin-desk/service-requests.js";
import { listAdminSubscribers, unsubscribeFromPanel } from "../services/admin-desk/subscribers.js";
import { actorOf } from "../services/audit.js";

/**
 * Solicitudes de servicio y suscriptores del panel (LN-16, RF-24, RF-25, RF-29).
 * Montado después de `requirePanel` en /admin. Solicitudes: Administrador y
 * Operador (tabla de la API de la SRS). Suscriptores: solo Administrador.
 */
export function adminDeskRouter(prisma: PrismaClient): Router {
  const router = Router();
  const staff = requireRole("admin", "operator");
  const admin = requireRole("admin");

  router
    .route("/admin/service-requests")
    .get(
      staff,
      validated({ query: requestListQuery }, async ({ query }, _req, res) => {
        res.json(await listAdminRequests(prisma, query));
      }),
    )
    .all(methodNotAllowed("GET"));

  router
    .route("/admin/service-requests/:id")
    .get(
      staff,
      validated({ params: requestParams }, async ({ params }, _req, res) => {
        res.json(await getAdminRequest(prisma, params.id));
      }),
    )
    .patch(
      staff,
      validated(
        { params: requestParams, body: followUpBody },
        async ({ params, body }, req, res) => {
          res.json(
            await followUpRequest(prisma, params.id, body, actorOf(req.panel), String(req.id)),
          );
        },
      ),
    )
    .all(methodNotAllowed("GET", "PATCH"));

  router
    .route("/admin/newsletter")
    .get(
      admin,
      validated({ query: subscriberListQuery }, async ({ query }, _req, res) => {
        res.json(await listAdminSubscribers(prisma, query));
      }),
    )
    .all(methodNotAllowed("GET"));

  router
    .route("/admin/newsletter/:id/unsubscribe")
    .post(
      admin,
      validated({ params: subscriberParams }, async ({ params }, req, res) => {
        res.json(await unsubscribeFromPanel(prisma, params.id, actorOf(req.panel), String(req.id)));
      }),
    )
    .all(methodNotAllowed("POST"));

  return router;
}
