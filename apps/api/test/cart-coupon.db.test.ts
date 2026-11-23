import { afterAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/lib/prisma.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { CartClient, chileDay, createCoupon, shopFixture } from "./cart-helpers.js";
import { buildTestApp } from "./helpers.js";
import { inRollback } from "./panel-helpers.js";

// Cupón en el carrito (LN-06, RF-07, RN-01) contra totalkids_test, en
// transacciones que se deshacen. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

interface CouponCart {
  coupon: { code: string; discount: number; valid: boolean; reason: string | null } | null;
  notices: { code: string; message: string }[];
  totals: { subtotal: number; discount: number; totalWithoutShipping: number };
}
const cartOf = (res: { body: unknown }) => res.body as CouponCart;

describe.skipIf(!url)("cupón del carrito /cart/coupon (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function scenario(
    fn: (ctx: {
      db: PrismaClient;
      client: CartClient;
      shop: Awaited<ReturnType<typeof shopFixture>>;
    }) => Promise<void>,
  ) {
    return () =>
      inRollback(prisma, async (db) => {
        const app = buildTestApp({ prisma: db });
        const shop = await shopFixture(db);
        await fn({ db, shop, client: new CartClient(app) });
      });
  }

  it(
    "rechaza con los mensajes de la tienda: vacío, inexistente, inactivo, futuro, vencido y agotado",
    scenario(async ({ db, client, shop }) => {
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });

      let res = await client.post("/cart/coupon", { code: "   " });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ message: "Escribe el código de tu cupón." });

      const cases = [
        { reason: "not_found", code: "NOEXISTE1" },
        { reason: "inactive", code: (await createCoupon(db, { active: false })).code },
        {
          reason: "not_started",
          code: (await createCoupon(db, { startsOn: chileDay(1), endsOn: chileDay(5) })).code,
        },
        {
          reason: "expired",
          code: (await createCoupon(db, { startsOn: chileDay(-5), endsOn: chileDay(-1) })).code,
        },
        { reason: "exhausted", code: (await createCoupon(db, { maxUses: 2, usesCount: 2 })).code },
      ];
      for (const { reason, code } of cases) {
        res = await client.post("/cart/coupon", { code });
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({
          code: "VALIDATION_ERROR",
          message: `El cupón «${code}» no existe o ya no está vigente.`,
          details: { reason },
        });
      }
      expect(cartOf(await client.get("/cart")).coupon).toBeNull();
    }),
  );

  it(
    "vigente hoy y el último día (inclusive); normaliza el código y no reserva usos",
    scenario(async ({ db, client, shop }) => {
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      const coupon = await createCoupon(db, { startsOn: chileDay(0), endsOn: chileDay(0) });
      const res = await client.post("/cart/coupon", {
        code: ` ${coupon.code.slice(0, 4).toLowerCase()} ${coupon.code.slice(4)} `,
      });
      expect(res.status).toBe(200);
      expect(cartOf(res).coupon).toMatchObject({ code: coupon.code, valid: true, discount: 1_000 });
      const stored = await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(stored.usesCount).toBe(0);
    }),
  );

  it(
    "porcentaje redondeado al peso y monto con tope en el subtotal (sin despacho)",
    scenario(async ({ db, client, shop }) => {
      await db.productVariant.update({ where: { id: shop.variantA }, data: { price: 9_990 } });
      await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      const percent = await createCoupon(db, { kind: "percent", value: 15 });
      let res = await client.post("/cart/coupon", { code: percent.code });
      expect(cartOf(res).totals).toEqual(
        expect.objectContaining({ subtotal: 9_990, discount: 1_499, totalWithoutShipping: 8_491 }),
      );

      // Otro cupón reemplaza al anterior (no se acumulan).
      const amount = await createCoupon(db, { kind: "amount", value: 50_000 });
      res = await client.post("/cart/coupon", { code: amount.code });
      expect(cartOf(res).coupon?.code).toBe(amount.code);
      expect(cartOf(res).totals).toEqual(
        expect.objectContaining({ subtotal: 9_990, discount: 9_990, totalWithoutShipping: 0 }),
      );

      res = await client.delete("/cart/coupon");
      expect(res.status).toBe(200);
      expect(cartOf(res).coupon).toBeNull();
      expect(cartOf(res).totals.discount).toBe(0);
    }),
  );

  it(
    "si deja de valer, no descuenta y avisa; la siguiente escritura lo quita",
    scenario(async ({ db, client, shop }) => {
      const added = await client.post("/cart/items", { sku: shop.skuA, quantity: 1 });
      const lineId = (added.body as { lines: { id: string }[] }).lines[0]?.id ?? "";
      const coupon = await createCoupon(db);
      await client.post("/cart/coupon", { code: coupon.code });
      await db.coupon.update({ where: { id: coupon.id }, data: { active: false } });

      let res = await client.get("/cart");
      expect(cartOf(res).coupon).toMatchObject({ valid: false, reason: "inactive", discount: 0 });
      expect(cartOf(res).notices).toEqual([
        {
          code: "coupon_removed",
          message: `El cupón «${coupon.code}» ya no está vigente y no se aplica.`,
        },
      ]);

      res = await client.patch(`/cart/items/${lineId}`, { quantity: 2 });
      expect(cartOf(res).coupon).toBeNull();
      expect(cartOf(res).notices.map((n) => n.code)).toEqual(["coupon_removed"]);
      const cart = await db.cart.findUniqueOrThrow({
        where: { guestTokenHash: hashToken(client.cart ?? "") },
      });
      expect(cart.couponId).toBeNull();
    }),
  );

  it(
    "sin productos no se aplica, y sin cookie no crea carrito",
    scenario(async ({ db, client }) => {
      const coupon = await createCoupon(db);
      const before = await db.cart.count();
      const res = await client.post("/cart/coupon", { code: coupon.code });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        message: "Agrega productos antes de aplicar un cupón.",
        details: { reason: "empty_cart" },
      });
      expect(await db.cart.count()).toBe(before);
      expect(client.cart).toBeUndefined();
    }),
  );
});
