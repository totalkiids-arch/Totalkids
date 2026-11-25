import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createLogger } from "../src/lib/logger.js";
import { issueOrderAccess } from "../src/lib/order-access.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { createPaymentJobs } from "../src/services/reconciliation/job.js";
import { createCoupon } from "./cart-helpers.js";
import { deleteOrders, deleteProducts } from "./cleanup.js";
import { FakeFlow } from "./fake-flow.js";
import { buildTestApp, csrfHeaders, testEnv } from "./helpers.js";
import { createOrder, createVariant } from "./order-fixtures.js";
import { panelHeaders, panelSession } from "./panel-helpers.js";

const HOUR = 60 * 60_000;
const logger = createLogger("silent", false);

// Callbacks de Flow en paralelo (LN-17: CA-03, CA-05) contra totalkids_test,
// también contra el job de conciliación (LN-15) y contra el panel.
// Flow es falso (FakeFlow) y no se envían correos: solo se encolan. Sin rollback
// compartido: cada petición confirma en su propia conexión, como en
// producción. Todo se borra en afterAll. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("callbacks de Flow en paralelo (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  // El worker usa su propia conexión, como el proceso aparte de producción.
  const worker = createPrismaClient(url ?? "");
  const created = { orders: [] as string[], products: [] as string[], categories: [] as string[] };
  const coupons: string[] = [];
  const staff: string[] = [];

  afterAll(async () => {
    await worker.$disconnect();
    await deleteOrders(prisma, created.orders);
    await deleteProducts(prisma, created.products, created.categories);
    await prisma.coupon.deleteMany({ where: { id: { in: coupons } } });
    await prisma.session.deleteMany({ where: { userId: { in: staff } } });
    // audit_log las referencia: quedan inactivas, como en rbac-contract.
    await prisma.user.updateMany({ where: { id: { in: staff } }, data: { status: "inactive" } });
    await prisma.$disconnect();
  });

  /** Pedido pendiente de 2 unidades reservadas de 5, con cupón reservado, y su pago en Flow. */
  async function prepare() {
    const variant = await createVariant(prisma, 5, 2);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: variant.productId } });
    created.products.push(product.id);
    created.categories.push(product.categoryId);
    const coupon = await createCoupon(prisma, { usesCount: 1 });
    coupons.push(coupon.id);
    // Correo propio: el job de conciliación solo toma pedidos de este comprador.
    const buyerEmail = `ln17-${randomUUID().slice(0, 8)}@correo.cl`;
    const order = await createOrder(prisma, {
      createdAt: new Date(),
      buyerEmail,
      lines: [{ variantId: variant.id, quantity: 2, reservation: "active" }],
      couponId: coupon.id,
    });
    created.orders.push(order.id);

    const flow = new FakeFlow();
    const app = buildTestApp({
      prisma,
      flow: { client: flow, callbackBase: "https://api.test/api/v1", sealSecret: "clave" },
    });
    const pay = await request(app)
      .post("/api/v1/payments/flow/create")
      .set(csrfHeaders())
      .set("x-order-access", issueOrderAccess(testEnv.CSRF_SECRET ?? "", order.id))
      .send({ orderNumber: `TK-${String(order.number)}` });
    expect(pay.status, JSON.stringify(pay.body)).toBe(200);

    const confirm = () =>
      request(app).post("/api/v1/payments/flow/confirm").type("form").send({ token: flow.token });
    const back = () =>
      request(app).post("/api/v1/payments/flow/return").type("form").send({ token: flow.token });

    const state = async () => {
      const where = { orderId: order.id };
      const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      const events = (await prisma.emailLog.findMany({ where })).map((e) => e.event).sort();
      return {
        order: (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status,
        payments: (await prisma.payment.findMany({ where, orderBy: { attempt: "asc" } })).map(
          (p) => p.status,
        ),
        stock: [v.stockPhysical, v.stockReserved],
        sales: await prisma.inventoryMovement.count({ where: { ...where, kind: "sale" } }),
        toConfirmed: await prisma.orderStatusHistory.count({
          where: { ...where, toStatus: "confirmed" },
        }),
        couponUses: (await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usesCount,
        redemption: (await prisma.couponRedemption.findUniqueOrThrow({ where })).status,
        emails: events,
      };
    };
    // Worker de LN-15 en otra conexión, con el reloj 2 horas adelante: el plazo
    // de pago (1 hora) ya venció y el intento abierto toca consultarlo a Flow.
    const jobs = () =>
      createPaymentJobs({
        prisma: worker,
        flow,
        logger,
        adminEmail: "equipo@example.com",
        config: { batchSize: 10, intervalMs: 1000, scopeBuyerEmail: buyerEmail },
        now: () => new Date(Date.now() + 2 * HOUR),
      }).runOnce();
    return { order, variant, flow, app, confirm, back, jobs, state };
  }

  const CONFIRMED_ONCE = {
    order: "confirmed",
    payments: ["paid"],
    stock: [3, 0],
    sales: 1,
    toConfirmed: 1,
    // El uso ya estaba contado al reservar: confirmar lo consume, no suma otro.
    couponUses: 1,
    redemption: "consumed",
    emails: ["new_sale", "purchase_confirmed"],
  };

  it("CA-03: callback de Flow N veces en paralelo: un consumo de stock, un uso de cupón, un correo de compra", async () => {
    const { flow, confirm, state } = await prepare();
    flow.set({ status: "paid", media: "Webpay" });

    const results = await Promise.all(Array.from({ length: 6 }, () => confirm()));

    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    expect(await state()).toEqual(CONFIRMED_ONCE);
  });

  it("CA-03: callback y retorno a la vez: el mismo resultado único", async () => {
    const { order, flow, confirm, back, state } = await prepare();
    flow.set({ status: "paid" });

    const results = await Promise.all([confirm(), back(), confirm(), back(), confirm(), back()]);

    for (const [i, res] of results.entries()) {
      if (i % 2 === 0) {
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(303);
        expect(res.headers.location).toContain(`pedido=TK-${String(order.number)}`);
      }
    }
    expect(await state()).toEqual(CONFIRMED_ONCE);
  });

  // ── CA-05: reserva vencida y pago tardío (RN-04/05) ───────────────────────

  async function expireBeforePayment(ctx: Awaited<ReturnType<typeof prepare>>, physical: number) {
    // El job venció el pedido y liberó su stock antes de que llegara el pago.
    await prisma.stockReservation.updateMany({
      where: { orderId: ctx.order.id },
      data: { status: "released", resolvedAt: new Date() },
    });
    await prisma.productVariant.update({
      where: { id: ctx.variant.id },
      // Mientras tanto se vendieron unidades: quedan `physical`.
      data: { stockReserved: 0, stockPhysical: physical },
    });
    await prisma.order.update({ where: { id: ctx.order.id }, data: { status: "expired" } });
  }

  it("CA-05: dos callbacks tardíos en paralelo con stock: una sola reasignación", async () => {
    const ctx = await prepare();
    await expireBeforePayment(ctx, 5);
    ctx.flow.set({ status: "paid" });

    const results = await Promise.all([ctx.confirm(), ctx.confirm()]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await ctx.state()).toMatchObject({
      order: "confirmed",
      payments: ["paid"],
      stock: [3, 0],
      sales: 1,
      toConfirmed: 1,
      emails: ["new_sale", "purchase_confirmed"],
    });
  });

  it("CA-05: dos callbacks tardíos en paralelo sin stock: a revisión con una sola alerta, sin vender", async () => {
    const ctx = await prepare();
    await expireBeforePayment(ctx, 1);
    ctx.flow.set({ status: "paid" });

    const results = await Promise.all([ctx.confirm(), ctx.confirm()]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await ctx.state()).toMatchObject({
      order: "in_review",
      payments: ["paid"],
      stock: [1, 0],
      sales: 0,
      toConfirmed: 0,
      emails: ["payment_review_alert"],
    });
  });

  // ── Callback contra el worker y contra el panel (LN-15, RN-04, RN-06) ─────

  it("CA-05: el job de conciliación y el callback pagado a la vez: se confirma una vez y nunca se vence", async () => {
    const ctx = await prepare();
    ctx.flow.set({ status: "paid" });

    const [runA, first, second, runB] = await Promise.all([
      ctx.jobs(),
      ctx.confirm(),
      ctx.confirm(),
      ctx.jobs(),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(runA.expired + runB.expired).toBe(0);
    expect(await ctx.state()).toEqual(CONFIRMED_ONCE);
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: ctx.order.id, toStatus: "expired" },
      }),
    ).toBe(0);
  });

  it("CA-05: Flow rechaza con el job y el callback a la vez, y luego el job vence: stock y cupón se liberan una sola vez", async () => {
    const ctx = await prepare();
    ctx.flow.set({ status: "rejected" });
    const movements = async () =>
      (
        await prisma.inventoryMovement.findMany({
          where: { orderId: ctx.order.id },
          select: { kind: true },
        })
      ).map((m) => m.kind);

    const [, first, , second] = await Promise.all([
      ctx.jobs(),
      ctx.confirm(),
      ctx.jobs(),
      ctx.confirm(),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    // Según quién gane, el pedido queda esperando otro intento o el job ya lo
    // venció; en ambos casos el rechazo libera la reserva una sola vez.
    const mid = await ctx.state();
    expect(["pending_payment", "expired"]).toContain(mid.order);
    expect(mid).toMatchObject({ payments: ["rejected"], stock: [5, 0], sales: 0, toConfirmed: 0 });
    expect(await movements()).toEqual(["release"]);

    // Siguiente pasada (dos workers a la vez): el pedido sin intento abierto
    // termina vencido y suelta el cupón; el stock no se vuelve a liberar.
    await Promise.all([ctx.jobs(), ctx.jobs()]);

    const end = await ctx.state();
    expect(end).toMatchObject({
      order: "expired",
      payments: ["rejected"],
      stock: [5, 0],
      sales: 0,
      toConfirmed: 0,
      couponUses: 0,
      redemption: "released",
    });
    expect(await movements()).toEqual(["release"]);
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: ctx.order.id, toStatus: "expired" },
      }),
    ).toBe(1);
    // Ningún correo repetido.
    expect(new Set(end.emails).size).toBe(end.emails.length);
  });

  it("CA-03: cancelar desde el panel mientras llega el pago: el cobro se aplica una vez y el stock cuadra", async () => {
    const ctx = await prepare();
    const { user, token } = await panelSession(prisma, "admin");
    staff.push(user.id);
    ctx.flow.set({ status: "paid" });

    const cancel = () =>
      request(ctx.app)
        .patch(`/api/v1/admin/orders/${ctx.order.id}/status`)
        .set(panelHeaders(token))
        .send({ to: "cancelled", reason: "El cliente pidió anular el pedido" });
    const [paid, cancelled] = await Promise.all([ctx.confirm(), cancel()]);

    expect(paid.status).toBe(200);
    // Con el intento abierto la cancelación se rechaza (409); si el pago ya se
    // aplicó, se cancela el pedido pagado sin reponer stock (restock: false).
    expect([200, 409]).toContain(cancelled.status);
    const after = await ctx.state();
    expect(after).toMatchObject({ payments: ["paid"], sales: 1, toConfirmed: 1, stock: [3, 0] });
    expect(after.order).toBe(cancelled.status === 200 ? "cancelled" : "confirmed");
    expect(after.emails.filter((e) => e === "purchase_confirmed")).toHaveLength(1);
  });
});
