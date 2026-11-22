import { Router } from "express";

import { AppError } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";

export function healthRouter(prisma: Pick<PrismaClient, "$queryRaw">): Router {
  const router = Router();

  router
    .route("/health")
    .get(async (_req, res) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (err) {
        throw new AppError(503, "DATABASE_UNAVAILABLE", "No hay conexión con la base de datos", {
          cause: err instanceof Error ? err.name : "UnknownError",
        });
      }
      res.json({ status: "ok" });
    })
    .all(methodNotAllowed("GET"));

  return router;
}
