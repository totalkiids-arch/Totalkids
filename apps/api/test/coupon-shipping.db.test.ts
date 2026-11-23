import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { chileDay } from "../src/lib/chile-time.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { CART_COOKIE_DEV } from "../src/middleware/cart-session.js";
import {
  consumeCouponUse,
  releaseCouponUse,
  reserveCouponUse,
} from "../src/services/coupon-usage.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// Cupón y despacho del carrito, y reserva atómica de usos (LN-06) contra
// totalkids_test. Se omite sin TEST_DATABASE_URL. Crea sus datos y los borra.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("cupón, despacho y reserva de usos (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const app = buildTestApp({ prisma });
  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  const created = {
    categoryId: "",
    productId: "",
    coupons: [] as string[],
    zones: [] as string[],
    orders: [] as string[],
  };
  let sku = "";
  const today = chileDay(new Date());
  const day = (offset: number) =>
    new Date(new Date(`${today}T12:00:00Z`).getTime() + offset * 86_400_000);

  function session(token?: string) {
    const csrf = csrfHeaders(token ? `|carrito:${hashToken(token)}` : "");
    return {
      ...csrf,
      cookie: token ? `${csrf.cookie}; ${CART_COOKIE_DEV}=${token}` : csrf.cookie,
    };
  }

  /** Carrito nuevo con 2 unidades de 50.000 (subtotal 100.000). */
  async function cartWithItems(): Promise<string> {
    const res = await request(app)
      .post("/api/v1/cart/items")
      .set(session())
      .send({ sku, quantity: 2 });
    const cookie = ([] as string[])
      .concat(res.headers["set-cookie"] ?? [])
      .find((c) => c.startsWith(`${CART_COOKIE_DEV}=`));
    return cookie?.split(";")[0]?.split("=")[1] ?? "";
  }

  async function coupon(
    code: string,
    data: Partial<{
      kind: "percent" | "amount";
      value: number;
      maxUses: number;
      usesCount: number;
      active: boolean;
      startsOn: Date;
      endsOn: Date;
    }> = {},
  ) {
    const row = await prisma.coupon.create({
      data: {
        code: `${code}${id}`,
        kind: "percent",
        value: 10,
        startsOn: day(-5),
        endsOn: day(5),
        maxUses: 100,
        ...data,
      },
    });
    created.coupons.push(row.id);
    return row;
  }

  async function order() {
    const row = await prisma.order.create({
      data: {
        idempotencyKey: `cupon-${Math.random().toString(36).slice(2)}`,
        buyerName: "María González",
        buyerRut: "12.345.678-5",
        buyerEmail: "maria@correo.cl",
        buyerPhone: "+56912345678",
        deliveryMethod: "pickup",
        pickupDetails: "Taller",
        taxDocument: "boleta",
        subtotal: 100_000,
        shippingCost: 0,
        total: 100_000,
        termsAcceptedAt: new Date(),
        termsVersion: "v1",
        paymentDueAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    created.orders.push(row.id);
    return row;
  }

  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `cupon-${id.toLowerCase()}`, name: "Cupones" },
    });
    created.categoryId = category.id;
    sku = `TK-CUP-${id}`;
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: `mesa-cupon-${id.toLowerCase()}`,
        name: "Mesa",
        status: "active",
        publishedAt: new Date("2026-01-01"),
        variants: { create: { sku, price: 50_000 } },
      },
    });
    created.productId = product.id;
    for (const [commune, price, freeShippingEligible] of [
      [`Temuco${id}`, 4_990, true],
      [`Lautaro${id}`, null, true],
      [`Pucon${id}`, 9_990, false],
    ] as const) {
      const zone = await prisma.shippingZone.create({
        data: {
          region: "AR",
          commune,
          price,
          freeShippingEligible,
          leadTime: "3 a 5 días hábiles",
        },
      });
      created.zones.push(zone.id);
    }
  });

  afterAll(async () => {
    await prisma.couponRedemption.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.cart.deleteMany({
      where: { items: { some: { variant: { productId: created.productId } } } },
    });
    await prisma.cart.deleteMany({ where: { couponId: { in: created.coupons } } });
    await prisma.coupon.deleteMany({ where: { id: { in: created.coupons } } });
    await prisma.shippingZone.deleteMany({ where: { id: { in: created.zones } } });
    await prisma.productVariant.deleteMany({ where: { productId: created.productId } });
    await prisma.product.deleteMany({ where: { id: created.productId } });
    await prisma.category.deleteMany({ where: { id: created.categoryId } });
    await prisma.$disconnect();
  });

  // ── Cupón en el carrito ────────────────────────────────────────────────────

  it("aplica un cupón vigente (código normalizado) y descuenta en el total", async () => {
    const row = await coupon("APRENDER");
    const token = await cartWithItems();
    const res = await request(app)
      .post("/api/v1/cart/coupon")
      .set(session(token))
      .send({ code: ` ${row.code.toLowerCase()} ` });
    expect(res.status).toBe(200);
    expect(res.body.coupon).toEqual({
      code: row.code,
      valid: true,
      discount: 10_000,
      message: null,
    });
    expect(res.body.totals).toEqual({
      subtotal: 100_000,
      discount: 10_000,
      shipping: null,
      total: 90_000,
    });

    // Persiste: GET /cart lo vuelve a evaluar.
    const again = await request(app)
      .get("/api/v1/cart")
      .set("cookie", `${CART_COOKIE_DEV}=${token}`);
    expect(again.body.coupon.valid).toBe(true);

    const removed = await request(app).delete("/api/v1/cart/coupon").set(session(token));
    expect(removed.body).toMatchObject({ coupon: null, totals: { discount: 0, total: 100_000 } });
  });

  it("rechaza cupones inexistentes, vencidos, futuros, inactivos o sin cupo (409 con motivo)", async () => {
    const token = await cartWithItems();
    const cases = [
      ["NOEXISTE", "not_found"],
      [(await coupon("VENCIDO", { startsOn: day(-10), endsOn: day(-1) })).code, "expired"],
      [(await coupon("FUTURO", { startsOn: day(1), endsOn: day(10) })).code, "not_started"],
      [(await coupon("PAUSADO", { active: false })).code, "inactive"],
      [(await coupon("AGOTADO", { maxUses: 2, usesCount: 2 })).code, "exhausted"],
    ] as const;
    for (const [code, reason] of cases) {
      const res = await request(app).post("/api/v1/cart/coupon").set(session(token)).send({ code });
      expect(res.status, code).toBe(409);
      expect(res.body.details.reason, code).toBe(reason);
    }
  });

  it("si el cupón se agota después de aplicarlo, el carrito lo informa sin descontar", async () => {
    const row = await coupon("ULTIMO", { maxUses: 1 });
    const token = await cartWithItems();
    await request(app).post("/api/v1/cart/coupon").set(session(token)).send({ code: row.code });
    await prisma.coupon.update({ where: { id: row.id }, data: { usesCount: 1 } });
    const res = await request(app).get("/api/v1/cart").set("cookie", `${CART_COOKIE_DEV}=${token}`);
    expect(res.body.coupon).toMatchObject({ valid: false, discount: 0 });
    expect(res.body.totals.total).toBe(100_000);
  });

  it("un monto fijo no supera el subtotal", async () => {
    const row = await coupon("GRANDE", { kind: "amount", value: 500_000 });
    const token = await cartWithItems();
    const res = await request(app)
      .post("/api/v1/cart/coupon")
      .set(session(token))
      .send({ code: row.code });
    expect(res.body.totals).toMatchObject({ discount: 100_000, total: 0 });
  });

  // ── Despacho ───────────────────────────────────────────────────────────────

  it("cotiza retiro gratis, tarifa de zona, por confirmar y despacho gratis desde el umbral", async () => {
    const token = await cartWithItems();
    const quote = async (query: string) =>
      (
        await request(app)
          .get(`/api/v1/shipping/quote?${query}`)
          .set("cookie", `${CART_COOKIE_DEV}=${token}`)
      ).body;

    expect(await quote("method=retiro")).toEqual({
      method: "retiro",
      cost: 0,
      reason: "pickup",
      leadTime: null,
    });
    expect(await quote(`method=despacho&region=AR&commune=temuco${id.toLowerCase()}`)).toEqual({
      method: "despacho",
      cost: 4_990,
      reason: "zone",
      leadTime: "3 a 5 días hábiles",
    });
    expect((await quote(`method=despacho&region=AR&commune=Lautaro${id}`)).cost).toBeNull();
    expect((await quote("method=despacho&region=AR&commune=Desconocida")).cost).toBeNull();

    // Umbral de despacho gratis: 80.000 ≤ subtotal 100.000.
    const existing = await prisma.setting.findUnique({ where: { id: 1 } });
    await prisma.setting.upsert({
      where: { id: 1 },
      create: { id: 1, pickupDetails: "Taller", freeShippingThreshold: 80_000 },
      update: { freeShippingThreshold: 80_000 },
    });
    try {
      expect(await quote(`method=despacho&region=AR&commune=Temuco${id}`)).toMatchObject({
        cost: 0,
        reason: "threshold",
      });
      // Una zona no elegible para despacho gratis cobra su tarifa.
      expect(await quote(`method=despacho&region=AR&commune=Pucon${id}`)).toMatchObject({
        cost: 9_990,
        reason: "zone",
      });
    } finally {
      if (existing) {
        await prisma.setting.update({
          where: { id: 1 },
          data: { freeShippingThreshold: existing.freeShippingThreshold },
        });
      } else {
        await prisma.setting.delete({ where: { id: 1 } });
      }
    }
  });

  // ── Reserva atómica de usos (para LN-09) ───────────────────────────────────

  it("con compras simultáneas nunca se supera el máximo de usos", async () => {
    const row = await coupon("CONCURRENTE", { maxUses: 3 });
    const orders = await Promise.all(Array.from({ length: 8 }, () => order()));
    const results = await Promise.all(
      orders.map((o) =>
        prisma.$transaction((tx) =>
          reserveCouponUse(tx, { couponId: row.id, orderId: o.id, discount: 10_000, today }),
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "exhausted")).toBe(true);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: row.id } })).usesCount).toBe(3);
    expect(await prisma.couponRedemption.count({ where: { couponId: row.id } })).toBe(3);
  });

  it("consumir no cambia el cupo; liberar lo devuelve una sola vez", async () => {
    const row = await coupon("CICLO", { maxUses: 1 });
    const [paid, expired] = [await order(), await order()];

    expect(
      (await reserveCouponUse(prisma, { couponId: row.id, orderId: paid.id, discount: 1, today }))
        .ok,
    ).toBe(true);
    expect(await consumeCouponUse(prisma, paid.id)).toBe(true);
    expect(await releaseCouponUse(prisma, paid.id)).toBe(false);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: row.id } })).usesCount).toBe(1);

    // Sin cupo: el otro pedido no puede reservar hasta que se libere un uso.
    expect(
      (
        await reserveCouponUse(prisma, {
          couponId: row.id,
          orderId: expired.id,
          discount: 1,
          today,
        })
      ).ok,
    ).toBe(false);

    const other = await coupon("LIBERA", { maxUses: 1 });
    await reserveCouponUse(prisma, { couponId: other.id, orderId: expired.id, discount: 1, today });
    expect(await releaseCouponUse(prisma, expired.id)).toBe(true);
    expect(await releaseCouponUse(prisma, expired.id)).toBe(false);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: other.id } })).usesCount).toBe(0);
  });

  it("no reserva un cupón vencido o inactivo", async () => {
    const vencido = await coupon("RESVENC", { startsOn: day(-10), endsOn: day(-1) });
    const pausado = await coupon("RESPAUSA", { active: false });
    for (const c of [vencido, pausado]) {
      const o = await order();
      expect(
        (await reserveCouponUse(prisma, { couponId: c.id, orderId: o.id, discount: 1, today })).ok,
      ).toBe(false);
    }
  });
});
