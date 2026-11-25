import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/lib/prisma.js";
import { CART_COOKIE_DEV, cartSessionKeyOf } from "../src/middleware/cart-session.js";
import { emailEventKey } from "../src/services/email/events.js";
import { createCoupon, setSettings } from "./cart-helpers.js";
import { deleteOrders, deleteProducts, ordersOfProducts } from "./cleanup.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// Concurrencia de la compra (LN-17: CA-02, CA-03, CA-08) contra totalkids_test.
// Sin rollback compartido: cada petición usa su propia conexión y confirma de
// verdad, como en producción. Todo lo creado se borra en afterAll. Se omite sin
// TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("concurrencia de la compra (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const app = buildTestApp({ prisma });
  const tag = randomUUID().slice(0, 8);
  const created = { categoryId: "", products: [] as string[], coupons: [] as string[] };
  let previousSettings: Awaited<ReturnType<typeof prisma.setting.findUnique>> = null;

  const BODY = {
    buyer: { name: "Ana Rojas", rut: "12345678-5", email: "ana@correo.cl", phone: "+56912345678" },
    delivery: { method: "retiro" },
    billing: { document: "boleta" },
    termsAccepted: true,
  };

  beforeAll(async () => {
    previousSettings = await prisma.setting.findUnique({ where: { id: 1 } });
    await setSettings(prisma, { pickupEnabled: true, freeShippingThreshold: null });
    const category = await prisma.category.create({
      data: { slug: `concurrencia-${tag}`, name: `Concurrencia ${tag}` },
    });
    created.categoryId = category.id;
  });

  afterAll(async () => {
    await deleteOrders(prisma, await ordersOfProducts(prisma, created.products));
    await deleteProducts(prisma, created.products, [created.categoryId]);
    await prisma.coupon.deleteMany({ where: { id: { in: created.coupons } } });
    if (previousSettings) {
      await prisma.setting.update({ where: { id: 1 }, data: previousSettings });
    } else {
      await prisma.setting.deleteMany({ where: { id: 1 } });
    }
    await prisma.$disconnect();
  });

  /** Producto publicado con una variante de `stockPhysical` unidades terminadas. */
  async function product(stockPhysical: number) {
    const slug = `cuna-${randomUUID().slice(0, 8)}`;
    const sku = `TK-${slug}`.toUpperCase();
    const row = await prisma.product.create({
      data: {
        categoryId: created.categoryId,
        slug,
        name: slug,
        status: "active",
        publishedAt: new Date("2026-01-01"),
        leadTime: "10 días hábiles",
        variants: { create: { sku, price: 30_000, stockPhysical } },
      },
      include: { variants: true },
    });
    created.products.push(row.id);
    return { sku, variantId: row.variants[0]?.id ?? "" };
  }

  function session(token?: string) {
    const csrf = csrfHeaders(token ? cartSessionKeyOf(token) : "");
    return { ...csrf, cookie: token ? `${csrf.cookie}; ${CART_COOKIE_DEV}=${token}` : csrf.cookie };
  }

  /** Carrito nuevo con esa línea (y el cupón, si viene); devuelve la cookie del carrito. */
  async function cart(sku: string, quantity: number, coupon?: string): Promise<string> {
    const res = await request(app)
      .post("/api/v1/cart/items")
      .set(session())
      .send({ sku, quantity });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const cookie = ([] as string[])
      .concat(res.headers["set-cookie"] ?? [])
      .find((c) => c.startsWith(`${CART_COOKIE_DEV}=`));
    const token = cookie?.split(";")[0]?.split("=")[1] ?? "";
    if (coupon) {
      const applied = await request(app)
        .post("/api/v1/cart/coupon")
        .set(session(token))
        .send({ code: coupon });
      expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    }
    return token;
  }

  /** Total cotizado para retiro, como lo ve el comprador antes de pagar. */
  async function quote(token: string): Promise<number> {
    const res = await request(app).get("/api/v1/shipping/quote?method=retiro").set(session(token));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body as { totals: { total: number } }).totals.total;
  }

  /** Prepara la compra (carrito y cotización) y devuelve la petición lista para disparar. */
  async function checkout(sku: string, quantity: number, coupon?: string) {
    const token = await cart(sku, quantity, coupon);
    const expectedTotal = await quote(token);
    return (key: string = randomUUID()) =>
      request(app)
        .post("/api/v1/orders")
        .set(session(token))
        .set("Idempotency-Key", key)
        .send({ ...BODY, expectedTotal });
  }

  async function variantState(variantId: string) {
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const reservations = await prisma.stockReservation.findMany({ where: { variantId } });
    const movements = await prisma.inventoryMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: "asc" },
    });
    return { physical: v.stockPhysical, reserved: v.stockReserved, reservations, movements };
  }

  // ── CA-02: última unidad simultánea (RF-06, RF-14, RF-18; RN-03) ───────────

  it("CA-02: N compras simultáneas por la última unidad terminada: una reserva, el resto a pedido, stock nunca negativo", async () => {
    const N = 8;
    const { sku, variantId } = await product(1);
    const buys = [];
    for (let i = 0; i < N; i += 1) buys.push(await checkout(sku, 1));

    const results = await Promise.all(buys.map((buy) => buy()));

    // Todo se fabrica a pedido (UI-11): nadie se queda sin comprar, pero solo uno
    // se lleva la unidad terminada.
    expect(
      results.map((r) => r.status),
      JSON.stringify(results.map((r) => r.body as unknown)),
    ).toEqual(Array(N).fill(201));
    const madeToOrder = results.map(
      (r) => (r.body.items as { madeToOrder: boolean }[])[0]?.madeToOrder,
    );
    expect(madeToOrder.filter((m) => m === false)).toHaveLength(1);
    expect(madeToOrder.filter((m) => m === true)).toHaveLength(N - 1);

    const state = await variantState(variantId);
    expect(state).toMatchObject({ physical: 1, reserved: 1 });
    expect(state.reservations.map((r) => [r.status, r.quantity])).toEqual([["active", 1]]);
    expect(state.movements.map((m) => [m.kind, m.reservedDelta, m.reservedAfter])).toEqual([
      ["reservation", 1, 1],
    ]);
  });

  it("CA-02: 2 terminadas y 6 compras con cantidades mixtas: lo reservado nunca supera lo físico y los movimientos cuadran", async () => {
    const { sku, variantId } = await product(2);
    const quantities = [2, 1, 1, 1, 1, 1];
    const buys = [];
    for (const q of quantities) buys.push(await checkout(sku, q));

    const results = await Promise.all(buys.map((buy) => buy()));
    expect(
      results.map((r) => r.status),
      JSON.stringify(results.map((r) => r.body as unknown)),
    ).toEqual(Array(quantities.length).fill(201));

    const state = await variantState(variantId);
    const active = state.reservations.filter((r) => r.status === "active");
    const reservedSum = active.reduce((n, r) => n + r.quantity, 0);
    expect(state).toMatchObject({ physical: 2, reserved: 2 });
    expect(reservedSum).toBe(2);

    // Cada pedido reservó entre 0 y lo pedido, y la línea es «a pedido» si le faltó.
    for (const [i, res] of results.entries()) {
      const number = Number((res.body.orderNumber as string).slice(3));
      const order = await prisma.order.findUniqueOrThrow({
        where: { number },
        include: { items: true, reservations: true },
      });
      const reserved = order.reservations.reduce((n, r) => n + r.quantity, 0);
      const quantity = quantities[i] ?? 0;
      expect(reserved).toBeGreaterThanOrEqual(0);
      expect(reserved).toBeLessThanOrEqual(quantity);
      expect(order.items[0]?.madeToOrder, `pedido ${String(number)}`).toBe(reserved < quantity);
    }

    // Los movimientos se encadenan: cada uno parte de lo que dejó el anterior y
    // ninguno deja el reservado fuera de [0, físico].
    let reserved = 0;
    for (const m of state.movements) {
      expect(m.kind).toBe("reservation");
      expect(m.reservedAfter).toBe(reserved + m.reservedDelta);
      expect(m.reservedAfter).toBeGreaterThanOrEqual(0);
      expect(m.reservedAfter).toBeLessThanOrEqual(m.physicalAfter);
      reserved = m.reservedAfter;
    }
    expect(reserved).toBe(2);
  });

  // ── CA-03: doble clic (RF-14) ────────────────────────────────────────────

  it("CA-03: la misma Idempotency-Key en paralelo: un pedido, una reserva, un correo de pedido recibido", async () => {
    const { sku, variantId } = await product(3);
    const buy = await checkout(sku, 1);
    const key = randomUUID();

    const results = await Promise.all(Array.from({ length: 6 }, () => buy(key)));

    const statuses = results.map((r) => r.status);
    expect(
      statuses.filter((s) => s === 201),
      JSON.stringify(statuses),
    ).toHaveLength(1);
    for (const res of results) {
      if (res.status === 409) {
        // Mientras la primera sigue en curso, las demás lo dicen; nunca otra cosa.
        expect(res.body.details.reason).toBe("in_progress");
      } else {
        expect([200, 201]).toContain(res.status);
      }
    }
    const first = results.find((r) => r.status === 201);
    for (const res of results.filter((r) => r.status === 200)) {
      expect(res.body.orderNumber).toBe(first?.body.orderNumber);
    }

    const orders = await prisma.order.findMany({ where: { idempotencyKey: key } });
    expect(orders).toHaveLength(1);
    const orderId = orders[0]?.id ?? "";
    expect(await prisma.idempotencyRecord.count({ where: { key } })).toBe(1);
    expect(await prisma.stockReservation.count({ where: { orderId } })).toBe(1);
    expect(
      await prisma.emailLog.count({
        where: { eventKey: emailEventKey("order_received", orderId) },
      }),
    ).toBe(1);
    expect(await variantState(variantId)).toMatchObject({ physical: 3, reserved: 1 });
  });

  // ── CA-08: cupón concurrente (RF-07) ──────────────────────────────────────

  it("CA-08: N pedidos en paralelo con un cupón de 2 usos: 2 con descuento, el resto 409 sin reservas", async () => {
    const coupon = await createCoupon(prisma, { kind: "percent", value: 10, maxUses: 2 });
    created.coupons.push(coupon.id);
    const { sku, variantId } = await product(20);
    const buys = [];
    // Todos aplican el cupón cuando aún tenía cupo: el carrito no reserva usos.
    for (let i = 0; i < 6; i += 1) buys.push(await checkout(sku, 1, coupon.code));

    const results = await Promise.all(buys.map((buy) => buy()));

    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status !== 201);
    expect(ok, JSON.stringify(results.map((r) => r.body as unknown))).toHaveLength(2);
    for (const res of ok) expect(res.body.totals).toMatchObject({ discount: 3_000 });
    for (const res of rejected) {
      // Según el momento: el cupón ya estaba agotado al revisar el carrito
      // (coupon_invalid) u otra compra simultánea tomó el último uso
      // (coupon_exhausted). Ambos están en el contrato; ninguno es un 5xx.
      expect(res.status).toBe(409);
      expect(["coupon_invalid", "coupon_exhausted"]).toContain(res.body.details.reason);
    }

    const row = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(row.usesCount).toBe(2);
    expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(2);
    // Los rechazados no dejaron pedido ni reserva.
    const state = await variantState(variantId);
    expect(state.reservations).toHaveLength(2);
    expect(state).toMatchObject({ physical: 20, reserved: 2 });
    expect(await prisma.order.count({ where: { couponId: coupon.id } })).toBe(2);
  });
});
