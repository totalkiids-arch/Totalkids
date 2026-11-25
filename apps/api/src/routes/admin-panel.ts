import { Router } from "express";
import { z } from "zod";

import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import { reason } from "../services/admin-orders/schemas.js";
import { activityQuery, listActivity } from "../services/admin-panel/activity.js";
import { listAdminPayments, paymentListQuery } from "../services/admin-panel/payments.js";
import { panelSummary } from "../services/admin-panel/summary.js";
import { actorOf } from "../services/audit.js";
import { reconcileFromPanel } from "../services/flow/reconcile.js";
import type { FlowGateway } from "../services/flow/start.js";

const paymentParams = z.object({ id: z.uuid("Identificador de pago inválido") });
const reconcileBody = z.object({ reason });

/**
 * Lecturas del panel (LN-16): resumen, pagos y actividad, más la conciliación
 * de un pago con Flow (LN-15). Montado después de
 * `requirePanel` en /admin. Resumen y pagos: Administrador y Operador (los
 * montos del resumen, solo el Administrador). Actividad: solo Administrador.
 */
export function adminPanelRouter(
  prisma: PrismaClient,
  payments: { flow: FlowGateway | null; adminEmail: string },
): Router {
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

  router
    .route("/admin/payments/:id/reconcile")
    .post(
      staff,
      validated(
        { params: paymentParams, body: reconcileBody },
        async ({ params, body }, req, res) => {
          res.json(
            await reconcileFromPanel(prisma, payments.flow, {
              paymentId: params.id,
              reason: body.reason,
              actor: actorOf(req.panel),
              adminEmail: payments.adminEmail,
              requestId: String(req.id),
            }),
          );
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
