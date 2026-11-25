import { Router } from "express";
import { z } from "zod";

import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import { activityQuery, listActivity } from "../services/admin-panel/activity.js";
import {
  getAdminPayment,
  listAdminPayments,
  paymentListQuery,
} from "../services/admin-panel/payments.js";
import { panelSummary } from "../services/admin-panel/summary.js";
import { actorOf } from "../services/audit.js";
import type { FlowClient } from "../services/flow/client.js";
import { reconcilePayment } from "../services/reconciliation/reconcile.js";
import { resolvePayment, resolvePaymentBody } from "../services/reconciliation/resolve.js";
import { RESOLUTION_MESSAGES } from "../services/reconciliation/rules.js";

/**
 * Panel (LN-16 y LN-15): resumen, pagos, conciliación y actividad. Montado
 * después de `requirePanel` en /admin. Resumen, pagos y «Consultar en Flow»:
 * Administrador y Operador (los montos del resumen, solo el Administrador).
 * Resolución manual de un pago y actividad: solo Administrador.
 */

const paymentParams = z.object({ id: z.uuid("Identificador de pago inválido") });

export interface AdminPanelOptions {
  /** Cliente de Flow para conciliar; null si Flow no está configurado. */
  flow: FlowClient | null;
  /** Casilla del equipo (alertas y nueva venta). */
  adminEmail: string;
}

export function adminPanelRouter(prisma: PrismaClient, options: AdminPanelOptions): Router {
  const router = Router();
  const staff = requireRole("admin", "operator");
  const admin = requireRole("admin");

  router
    .route("/admin/summary")
    .get(staff, async (req, res) => {
      if (!req.panel) throw errors.unauthorized("Debes iniciar sesión en el panel");
      res.json(await panelSummary(prisma, req.panel.user.role));
    })
    .all(methodNotAllowed("GET"));

  router
    .route("/admin/payments")
    .get(
      staff,
      validated({ query: paymentListQuery }, async ({ query }, _req, res) => {
        res.json(await listAdminPayments(prisma, query));
      }),
    )
    .all(methodNotAllowed("GET"));

  // RF-33: consulta el estado real en Flow y lo asienta (idempotente).
  router
    .route("/admin/payments/:id/reconcile")
    .post(
      staff,
      validated({ params: paymentParams }, async ({ params }, _req, res) => {
        const before = await getAdminPayment(prisma, params.id);
        if (!before.reconcilable) {
          throw errors.conflict(RESOLUTION_MESSAGES.notReconcilable, { field: "form" });
        }
        if (!options.flow) {
          throw errors.conflict(RESOLUTION_MESSAGES.flowDisabled, { field: "form" });
        }
        const result = await reconcilePayment(
          { prisma, flow: options.flow, adminEmail: options.adminEmail },
          params.id,
        );
        res.json({ ...result, payment: await getAdminPayment(prisma, params.id) });
      }),
    )
    .all(methodNotAllowed("POST"));

  // RF-33, RN-05, RN-06: resolución manual con motivo (solo Administrador).
  router
    .route("/admin/payments/:id/resolve")
    .post(
      admin,
      validated(
        { params: paymentParams, body: resolvePaymentBody },
        async ({ params, body }, req, res) => {
          const result = await resolvePayment(prisma, params.id, body, {
            actor: actorOf(req.panel),
            adminEmail: options.adminEmail,
            requestId: String(req.id),
          });
          res.json({ ...result, payment: await getAdminPayment(prisma, params.id) });
        },
      ),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/admin/activity")
    .get(
      admin,
      validated({ query: activityQuery }, async ({ query }, _req, res) => {
        res.json(await listActivity(prisma, query));
      }),
    )
    .all(methodNotAllowed("GET"));

  return router;
}
