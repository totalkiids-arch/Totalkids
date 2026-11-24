import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/lib/prisma.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import type { ShippingQuoter } from "../src/services/shipping/quoter.js";
import { CartClient, createCoupon, setSettings, shopFixture } from "./cart-helpers.js";
import { buildTestApp } from "./helpers.js";
import { inRollback } from "./panel-helpers.js";

// Cotización de entrega (LN-06, RF-08, RF-11) contra totalkids_test, en
// transacciones que se deshacen. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

interface QuoteBody {
  method: string;
  cost: number | null;
  reason: string;
  leadTime: string | null;
  pickupDetails: string | null;
  zone: { region: string; commune: string } | null;
  freeShipping: { threshold: number; remaining: number; reached: boolean } | null;
  message: string | null;
  totals: { subtotal: number; discount: number; shipping: number | null; total: number };
}
const quoteOf = (res: { body: unknown }) => res.body as QuoteBody;

describe.skipIf(!url)("GET /shipping/quote (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function scenario(
    fn: (ctx: {
      db: PrismaClient;
      client: CartClient;
      shop: Awaited<ReturnType<typeof shopFixture>>;
      tag: string;
      zone: (data: {
        commune: string;
        price?: number | null;
        freeShippingEligible?: boolean;
        active?: boolean;
      }) => Promise<void>;
    }) => Promise<void>,
  ) {
    return () =>
      inRollback(prisma, async (db) => {
        const app = buildTestApp({ prisma: db });
        const shop = await shopFixture(db);
        const tag = randomUUID().slice(0, 8);
        const zone = async (data: {
          commune: string;
          price?: number | null;
          freeShippingEligible?: boolean;
          active?: boolean;
        }) => {
          await db.shippingZone.create({
            data: { region: "RM", leadTime: "2 a 4 días hábiles", price: 4_990, ...data },
          });
        };
        await fn({ db, shop, tag, zone, client: new CartClient(app) });
      });
  }

  const despacho = (commune: string) =>
    `/shipping/quote?method=despacho&region=rm&commune=${encodeURIComponent(commune)}`;

  it(
    "retiro: gratis con la dirección del taller; deshabilitado → 422",
    scenario(async ({ db, client, shop }) => {
      await client.post("/cart/items", { sku: shop.skuA, quantity: 2 });
      await setSettings(db, { pickupEnabled: true, pickupDetails: "Taller en Maipú, 9 a 18 h" });
      let res = await client.get("/shipping/quote?method=retiro");
      expect(res.status).toBe(200);
      expect(quoteOf(res)).toMatchObject({
        method: "retiro",
        cost: 0,
        reason: "pickup",
        pickupDetails: "Taller en Maipú, 9 a 18 h",
        freeShipping: null,
        totals: { subtotal: 20_000, discount: 0, shipping: 0, total: 20_000 },
      });

      await setSettings(db, { pickupEnabled: false });
      res = await client.get("/shipping/quote?method=retiro");
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        message: "El retiro en taller no está disponible por ahora.",
      });
    }),
  );

  it(
    "despacho con tarifa de zona (comuna sin tildes ni mayúsculas); el cupón no descuenta el despacho",
    scenario(async ({ db, client, shop, tag, zone }) => {
      await setSettings(db, { freeShippingThreshold: 100_000 });
      await zone({ commune: `Ñuñoa ${tag}` });
      await client.post("/cart/items", { sku: shop.skuA, quantity: 2 });
      const coupon = await createCoupon(db, { kind: "amount", value: 50_000 });
      await client.post("/cart/coupon", { code: coupon.code });

      const res = await client.get(despacho(`NUNOA  ${tag}`));
      expect(res.status).toBe(200);
      expect(quoteOf(res)).toMatchObject({
        method: "despacho",
        cost: 4_990,
        reason: "zone",
        leadTime: "2 a 4 días hábiles",
        zone: { region: "RM", commune: `Ñuñoa ${tag}` },
        freeShipping: { threshold: 100_000, remaining: 100_000, reached: false },
        totals: { subtotal: 20_000, discount: 20_000, shipping: 4_990, total: 4_990 },
      });
    }),
  );

  it(
    "umbral de despacho gratis sobre subtotal − descuento, solo en zonas elegibles",
    scenario(async ({ db, client, shop, tag, zone }) => {
      await setSettings(db, { freeShippingThreshold: 30_000 });
      await zone({ commune: `Elegible ${tag}` });
      await zone({ commune: `Lejana ${tag}`, price: 9_990, freeShippingEligible: false });
      await client.post("/cart/items", { sku: shop.skuA, quantity: 3 });

      let res = await client.get(despacho(`Elegible ${tag}`));
      expect(quoteOf(res)).toMatchObject({
        cost: 0,
        reason: "threshold",
        message: "¡Tu compra tiene despacho gratis!",
        freeShipping: { remaining: 0, reached: true },
        totals: { total: 30_000 },
      });

      res = await client.get(despacho(`Lejana ${tag}`));
      expect(quoteOf(res)).toMatchObject({ cost: 9_990, reason: "zone", freeShipping: null });

      // Con un 10 % de descuento queda bajo el umbral (RF-08: después del descuento).
      const coupon = await createCoupon(db, { kind: "percent", value: 10 });
      await client.post("/cart/coupon", { code: coupon.code });
      res = await client.get(despacho(`Elegible ${tag}`));
      expect(quoteOf(res)).toMatchObject({
        cost: 4_990,
        reason: "zone",
        freeShipping: { remaining: 3_000, reached: false },
        totals: { subtotal: 30_000, discount: 3_000, shipping: 4_990, total: 31_990 },
      });
    }),
  );

  it(
    "zona sin tarifa: por confirmar (null, no suma); comuna sin zona o inactiva: a coordinar",
    scenario(async ({ client, shop, tag, zone }) => {
      await zone({ commune: `Sin tarifa ${tag}`, price: null });
      await zone({ commune: `Cerrada ${tag}`, active: false });
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });

      let res = await client.get(despacho(`Sin tarifa ${tag}`));
      expect(quoteOf(res)).toMatchObject({
        cost: null,
        reason: "pending_rate",
        message: "Tarifa por confirmar: te contactaremos para coordinar el despacho.",
        totals: { shipping: null, total: 10_000 },
      });

      for (const commune of [`Cerrada ${tag}`, `Inexistente ${tag}`]) {
        res = await client.get(despacho(commune));
        expect(quoteOf(res)).toMatchObject({
          cost: null,
          reason: "coordinate",
          zone: null,
          freeShipping: null,
          message: "Coordinaremos contigo el despacho a tu comuna.",
        });
      }
    }),
  );

  it(
    "despacho sin región o comuna → 422; sin carrito la base es 0",
    scenario(async ({ client, tag, zone }) => {
      let res = await client.get("/shipping/quote?method=despacho&region=RM");
      expect(res.status).toBe(422);
      res = await client.get("/shipping/quote?method=avion");
      expect(res.status).toBe(422);
      await zone({ commune: `Base ${tag}` });
      res = await client.get(despacho(`Base ${tag}`));
      expect(quoteOf(res).totals).toEqual({
        subtotal: 0,
        discount: 0,
        shipping: 4_990,
        total: 4_990,
      });
    }),
  );

  it("usa el puerto ShippingQuoter inyectado (p. ej. un courier futuro)", async () => {
    const quoter: ShippingQuoter = {
      quote: (req) =>
        Promise.resolve({
          method: req.method,
          cost: 1_234,
          reason: "zone",
          leadTime: "48 h",
          pickupDetails: null,
          zone: null,
          freeShipping: null,
          message: null,
        }),
    };
    await inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db, shippingQuoter: quoter });
      const res = await request(app).get(
        "/api/v1/shipping/quote?method=despacho&region=RM&commune=X",
      );
      expect(quoteOf(res)).toMatchObject({
        cost: 1_234,
        leadTime: "48 h",
        totals: { total: 1_234 },
      });
    });
  });
});
