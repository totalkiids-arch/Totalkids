import { Router } from "express";

import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { requireRole } from "../middleware/panel-auth.js";
import {
  createCoupon,
  deleteCoupon,
  getAdminCoupon,
  listAdminCoupons,
  updateCoupon,
} from "../services/admin-config/coupons.js";
import {
  createBanner,
  deactivateBanner,
  listAdminBanners,
  updateBanner,
} from "../services/admin-config/banners.js";
import {
  createBannerBody,
  createCouponBody,
  createZoneBody,
  idParams,
  shippingSettingsBody,
  storeThemeBody,
  updateBannerBody,
  updateCouponBody,
  updateZoneBody,
} from "../services/admin-config/schemas.js";
import {
  createZone,
  deactivateZone,
  getAdminStoreTheme,
  getShippingSettings,
  listAdminZones,
  saveShippingSettings,
  setStoreTheme,
  updateZone,
} from "../services/admin-config/shipping.js";
import { actorOf } from "../services/audit.js";

/**
 * Configuración del panel (LN-16, RF-28): cupones, banners, zonas de despacho,
 * condiciones de retiro y plantilla de la tienda. Montado después de
 * `requirePanel` en /admin; todo es solo para el Administrador (el Operador no
 * modifica configuración, RF-31), también las lecturas.
 */
export function adminConfigRouter(prisma: PrismaClient): Router {
  const router = Router();
  const admin = requireRole("admin");

  // ── Cupones ────────────────────────────────────────────────────────────────
  router
    .route("/admin/coupons")
    .get(admin, async (_req, res) => {
      res.json(await listAdminCoupons(prisma));
    })
    .post(
      admin,
      validated({ body: createCouponBody }, async ({ body }, req, res) => {
        const coupon = await createCoupon(prisma, body, actorOf(req.panel), String(req.id));
        res.status(201).location(`/api/v1/admin/coupons/${coupon.id}`).json(coupon);
      }),
    )
    .all(methodNotAllowed("GET", "POST"));

  router
    .route("/admin/coupons/:id")
    .get(
      admin,
      validated({ params: idParams }, async ({ params }, _req, res) => {
        res.json(await getAdminCoupon(prisma, params.id));
      }),
    )
    .patch(
      admin,
      validated(
        { params: idParams, body: updateCouponBody },
        async ({ params, body }, req, res) => {
          res.json(await updateCoupon(prisma, params.id, body, actorOf(req.panel), String(req.id)));
        },
      ),
    )
    .delete(
      admin,
      validated({ params: idParams }, async ({ params }, req, res) => {
        await deleteCoupon(prisma, params.id, actorOf(req.panel), String(req.id));
        res.status(204).end();
      }),
    )
    .all(methodNotAllowed("GET", "PATCH", "DELETE"));

  // ── Banners ────────────────────────────────────────────────────────────────
  router
    .route("/admin/banners")
    .get(admin, async (_req, res) => {
      res.json(await listAdminBanners(prisma));
    })
    .post(
      admin,
      validated({ body: createBannerBody }, async ({ body }, req, res) => {
        const banner = await createBanner(prisma, body, actorOf(req.panel), String(req.id));
        res.status(201).location(`/api/v1/admin/banners/${banner.id}`).json(banner);
      }),
    )
    .all(methodNotAllowed("GET", "POST"));

  router
    .route("/admin/banners/:id")
    .patch(
      admin,
      validated(
        { params: idParams, body: updateBannerBody },
        async ({ params, body }, req, res) => {
          res.json(await updateBanner(prisma, params.id, body, actorOf(req.panel), String(req.id)));
        },
      ),
    )
    .delete(
      admin,
      validated({ params: idParams }, async ({ params }, req, res) => {
        // Los banners no se eliminan: se desactivan.
        await deactivateBanner(prisma, params.id, actorOf(req.panel), String(req.id));
        res.status(204).end();
      }),
    )
    .all(methodNotAllowed("PATCH", "DELETE"));

  // ── Zonas de despacho ──────────────────────────────────────────────────────
  router
    .route("/admin/shipping-zones")
    .get(admin, async (_req, res) => {
      res.json(await listAdminZones(prisma));
    })
    .post(
      admin,
      validated({ body: createZoneBody }, async ({ body }, req, res) => {
        const zone = await createZone(prisma, body, actorOf(req.panel), String(req.id));
        res.status(201).location(`/api/v1/admin/shipping-zones/${zone.id}`).json(zone);
      }),
    )
    .all(methodNotAllowed("GET", "POST"));

  router
    .route("/admin/shipping-zones/:id")
    .patch(
      admin,
      validated({ params: idParams, body: updateZoneBody }, async ({ params, body }, req, res) => {
        res.json(await updateZone(prisma, params.id, body, actorOf(req.panel), String(req.id)));
      }),
    )
    .delete(
      admin,
      validated({ params: idParams }, async ({ params }, req, res) => {
        await deactivateZone(prisma, params.id, actorOf(req.panel), String(req.id));
        res.status(204).end();
      }),
    )
    .all(methodNotAllowed("PATCH", "DELETE"));

  // ── Condiciones de retiro y despacho ───────────────────────────────────────
  router
    .route("/admin/shipping-settings")
    .get(admin, async (_req, res) => {
      res.json(await getShippingSettings(prisma));
    })
    .put(
      admin,
      validated({ body: shippingSettingsBody }, async ({ body }, req, res) => {
        res.json(await saveShippingSettings(prisma, body, actorOf(req.panel), String(req.id)));
      }),
    )
    .all(methodNotAllowed("GET", "PUT"));

  // ── Plantilla de la tienda ─────────────────────────────────────────────────
  router
    .route("/admin/store-theme")
    .get(admin, async (_req, res) => {
      res.json(await getAdminStoreTheme(prisma));
    })
    .put(
      admin,
      validated({ body: storeThemeBody }, async ({ body }, req, res) => {
        res.json(await setStoreTheme(prisma, body.theme, actorOf(req.panel), String(req.id)));
      }),
    )
    .all(methodNotAllowed("GET", "PUT"));

  return router;
}
