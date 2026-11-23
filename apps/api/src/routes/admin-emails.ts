import { Router } from "express";
import { z } from "zod";

import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import { ROLE_LABEL } from "../services/auth.js";
import { requestEmailResend } from "../services/email/resend.js";

const emailParams = z.object({ id: z.uuid("Identificador de correo inválido") });

/**
 * Correos del panel (LN-14). Montado después de `requirePanel` en /admin, así
 * que la sesión ya se exige; el reenvío es solo para Administrador (RF-21).
 * El listado del registro llega con LN-16.
 */
export function adminEmailsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router
    .route("/admin/emails/:id/resend")
    .post(
      requireRole("admin"),
      validated({ params: emailParams }, async ({ params }, req, res) => {
        const user = req.panel?.user;
        if (!user) throw errors.unauthorized("Debes iniciar sesión en el panel");
        const result = await requestEmailResend(
          prisma,
          params.id,
          { actorUserId: user.id, actorLabel: ROLE_LABEL[user.role] },
          String(req.id),
        );
        res.status(202).json(result);
      }),
    )
    .all(methodNotAllowed("POST"));

  return router;
}
