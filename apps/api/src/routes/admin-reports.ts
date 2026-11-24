import { Router } from "express";
import { z } from "zod";

import { sendCsv } from "../lib/csv.js";
import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import { exportCsv, isExportResource } from "../services/admin-reports/exports.js";
import { buildSalesReport, periodQuery, resolvePeriod } from "../services/admin-reports/sales.js";
import { actorOf } from "../services/audit.js";

/**
 * Reportes y exportaciones del panel (LN-16, RF-29, RF-30). Solo Administrador:
 * la tabla de la API de la SRS manda sobre UC-08 (que también nombra al
 * Operador). Montado después de `requirePanel` en /admin.
 */
export function adminReportsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const admin = requireRole("admin");

  router
    .route("/admin/reports/sales")
    .get(
      admin,
      validated({ query: periodQuery }, async ({ query }, _req, res) => {
        res.json(await buildSalesReport(prisma, resolvePeriod(query)));
      }),
    )
    .all(methodNotAllowed("GET"));

  router
    .route("/admin/exports/:resource")
    .get(
      admin,
      validated(
        { params: z.object({ resource: z.string().max(40) }) },
        async ({ params }, req, res) => {
          if (!isExportResource(params.resource))
            throw errors.notFound("Esa exportación no existe.");
          const file = await exportCsv(
            prisma,
            params.resource,
            req.query,
            actorOf(req.panel),
            String(req.id),
          );
          res.setHeader("X-Export-Rows", String(file.rows));
          sendCsv(res, file.filename, file.csv);
        },
      ),
    )
    .all(methodNotAllowed("GET"));

  return router;
}
