import { Router } from "express";

import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import {
  createUser,
  createUserBody,
  listAdminUsers,
  roleBody,
  updateUser,
  updateUserBody,
  userParams,
} from "../services/admin-users.js";
import { actorOf } from "../services/audit.js";

/**
 * Usuarios y roles del panel (LN-16, RF-31). Solo Administrador. Montado
 * después de `requirePanel` en /admin. `PATCH /admin/users/{id}/role` es la
 * operación de la tabla de la SRS; `PATCH /admin/users/{id}` guarda el
 * formulario completo (nombre, correo, rol y estado) con las mismas reglas.
 */
export function adminUsersRouter(prisma: PrismaClient): Router {
  const router = Router();
  const admin = requireRole("admin");

  router
    .route("/admin/users")
    .get(admin, async (req, res) => {
      if (!req.panel) throw errors.unauthorized("Debes iniciar sesión en el panel");
      res.json(await listAdminUsers(prisma, req.panel.user.id));
    })
    .post(
      admin,
      validated({ body: createUserBody }, async ({ body }, req, res) => {
        const user = await createUser(prisma, body, actorOf(req.panel), String(req.id));
        res.status(201).location(`/api/v1/admin/users/${user.id}`).json(user);
      }),
    )
    .all(methodNotAllowed("GET", "POST"));

  router
    .route("/admin/users/:id")
    .patch(
      admin,
      validated(
        { params: userParams, body: updateUserBody },
        async ({ params, body }, req, res) => {
          res.json(await updateUser(prisma, params.id, body, actorOf(req.panel), String(req.id)));
        },
      ),
    )
    .all(methodNotAllowed("PATCH"));

  router
    .route("/admin/users/:id/role")
    .patch(
      admin,
      validated({ params: userParams, body: roleBody }, async ({ params, body }, req, res) => {
        res.json(await updateUser(prisma, params.id, body, actorOf(req.panel), String(req.id)));
      }),
    )
    .all(methodNotAllowed("PATCH"));

  return router;
}
