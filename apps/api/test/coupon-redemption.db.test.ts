import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import {
  consumeCouponUse,
  CouponUnavailableError,
  releaseCouponUse,
  reserveCouponUse,
} from "../src/services/coupons.js";
import { chileDay, createCoupon } from "./cart-helpers.js";

// Reserva de usos de cupón (RF-07, CA-08) con conexiones reales: las
// transacciones se confirman de verdad para probar la concurrencia. Los
// pedidos no tienen líneas (no afectan «más vendidos» del catálogo) y todo se
// borra al final. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("reserveCouponUse / consume / release (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const created = { coupons: [] as string[], orders: [] as string[] };

  afterAll(async () => {
    await prisma.couponRedemption.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.coupon.deleteMany({ where: { id: { in: created.coupons } } });
    await prisma.$disconnect();
  });

  async function coupon(data: Parameters<typeof createCoupon>[1]) {
    const row = await createCoupon(prisma, data);
    created.coupons.push(row.id);
    return row;
  }

  /** Pedido mínimo de retiro, pendiente de pago (sin líneas). */
  async function order() {
    const row = await prisma.order.create({
      data: {
        idempotencyKey: `cupon-${randomUUID()}`,
        buyerName: "Compra",
        buyerRut: "12.345.678-5",
        buyerEmail: "compra@correo.cl",
        buyerPhone: "+56912345678",
        deliveryMethod: "pickup",
        pickupDetails: "Taller",
        taxDocument: "boleta",
        subtotal: 10_000,
        shippingCost: 0,
        total: 10_000,
        termsAcceptedAt: new Date(),
        termsVersion: "v1",
        paymentDueAt: new Date(Date.now() + 60_000),
      },
    });
    created.orders.push(row.id);
    return row.id;
  }

  it("con compras simultáneas nunca supera max_uses", async () => {
    const { id: couponId } = await coupon({ maxUses: 3 });
    const orders = await Promise.all(Array.from({ length: 10 }, () => order()));

    const results = await Promise.allSettled(
      orders.map((orderId) =>
        prisma.$transaction((tx) => reserveCouponUse(tx, { couponId, orderId, discount: 1_000 })),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(3);
    expect(failed).toHaveLength(7);
    for (const r of failed) expect(r.reason).toBeInstanceOf(CouponUnavailableError);

    const stored = await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
    expect(stored.usesCount).toBe(3);
    expect(await prisma.couponRedemption.count({ where: { couponId, status: "reserved" } })).toBe(
      3,
    );
  });

  it("liberar devuelve el cupo una sola vez, aunque se llame a la par", async () => {
    const { id: couponId } = await coupon({ maxUses: 1 });
    const first = await order();
    await prisma.$transaction((tx) =>
      reserveCouponUse(tx, { couponId, orderId: first, discount: 500 }),
    );

    const second = await order();
    await expect(
      prisma.$transaction((tx) =>
        reserveCouponUse(tx, { couponId, orderId: second, discount: 500 }),
      ),
    ).rejects.toBeInstanceOf(CouponUnavailableError);

    const released = await Promise.all([
      prisma.$transaction((tx) => releaseCouponUse(tx, first)),
      prisma.$transaction((tx) => releaseCouponUse(tx, first)),
    ]);
    expect(released.filter(Boolean)).toHaveLength(1);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } })).usesCount).toBe(0);

    // Con el cupo devuelto, otro pedido puede usarlo.
    await prisma.$transaction((tx) =>
      reserveCouponUse(tx, { couponId, orderId: second, discount: 500 }),
    );
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } })).usesCount).toBe(1);
  });

  it("consumir es idempotente y un uso consumido no se libera", async () => {
    const { id: couponId } = await coupon({ maxUses: 5 });
    const orderId = await order();
    await prisma.$transaction((tx) => reserveCouponUse(tx, { couponId, orderId, discount: 700 }));

    expect(await prisma.$transaction((tx) => consumeCouponUse(tx, orderId))).toBe(true);
    expect(await prisma.$transaction((tx) => consumeCouponUse(tx, orderId))).toBe(false);
    expect(await prisma.$transaction((tx) => releaseCouponUse(tx, orderId))).toBe(false);

    const redemption = await prisma.couponRedemption.findUniqueOrThrow({ where: { orderId } });
    expect(redemption).toMatchObject({ status: "consumed", discount: 700 });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } })).usesCount).toBe(1);
  });

  it("no reserva cupones vencidos, futuros ni inactivos", async () => {
    const cases = [
      await coupon({ startsOn: chileDay(-5), endsOn: chileDay(-1) }),
      await coupon({ startsOn: chileDay(1), endsOn: chileDay(5) }),
      await coupon({ active: false }),
    ];
    for (const { id: couponId } of cases) {
      const orderId = await order();
      await expect(
        prisma.$transaction((tx) => reserveCouponUse(tx, { couponId, orderId, discount: 0 })),
      ).rejects.toBeInstanceOf(CouponUnavailableError);
    }
  });
});
