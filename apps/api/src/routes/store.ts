import { Router } from "express";

import type { PrismaClient } from "../lib/prisma.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { listPublicBanners } from "../services/admin-config/banners.js";
import { getStoreTheme } from "../services/admin-config/shipping.js";

/**
 * Lecturas públicas de la tienda que se configuran en el panel (LN-16, RF-28):
 * la plantilla activa y los banners de la portada (solo activos y vigentes).
 * Sin sesión; el límite global por IP ya aplica.
 */
export function storeRouter(prisma: PrismaClient): Router {
  const router = Router();

  router
    .route("/store-theme")
    .get(async (_req, res) => {
      res.json(await getStoreTheme(prisma));
    })
    .all(methodNotAllowed("GET"));

  router
    .route("/banners")
    .get(async (_req, res) => {
      res.json(await listPublicBanners(prisma));
    })
    .all(methodNotAllowed("GET"));

  return router;
}
