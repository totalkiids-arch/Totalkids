import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { issueOrderAccess } from "../src/lib/order-access.js";
import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { FlowRejectedError, FlowUncertainError } from "../src/services/flow/client.js";
import { FakeFlow } from "./fake-flow.js";
import { buildTestApp, csrfHeaders, testEnv } from "./helpers.js";
import { createOrder, createVariant, type OrderSpec } from "./order-fixtures.js";
import { inRollback } from "./panel-helpers.js";

// Pago con Flow (LN-10) contra totalkids_test, en transacciones que se deshacen.
// Flow es falso. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("pagos con Flow (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  afterAll(() => prisma.$disconnect());

  type Ctx = Awaited<ReturnType<typeof prepare>>;

  async function prepare(db: PrismaClient, spec: OrderSpec = {}, physical = 5) {
    const variant = await createVariant(db, physical, 2);
    const order = await createOrder(db, {
      createdAt: new Date(),
      lines: [{ variantId: variant.id, quantity: 2, reservation: "active" }],
      ...spec,
    });
    const flow = new FakeFlow();
    const app = buildTestApp({
      prisma: db,
      flow: { client: flow, callbackBase: "https://api.test/api/v1", sealSecret: "clave" },
    });
    const pay = () =>
      request(app)
        .post("/api/v1/payments/flow/create")
        .set(csrfHeaders())
        .set("x-order-access", issueOrderAccess(testEnv.CSRF_SECRET ?? "", order.id))
        .send({ orderNumber: `TK-${String(order.number)}` });
    const confirm = () =>
      request(app).post("/api/v1/payments/flow/confirm").type("form").send({ token: flow.token });
    const state = async () => ({
      order: (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
      payments: (
        await db.payment.findMany({ where: { orderId: order.id }, orderBy: { attempt: "asc" } })
      ).map((p) => p.status),
      stock: await db.productVariant
        .findUniqueOrThrow({ where: { id: variant.id } })
        .then((v) => [v.stockPhysical, v.stockReserved]),
      emails: (await db.emailLog.findMany({ where: { orderId: order.id } }))
        .map((e) => e.event)
        .sort(),
    });
    return { db, variant, order, flow, app, pay, confirm, state };
  }

  const run = (fn: (ctx: Ctx) => Promise<void>, spec?: OrderSpec, physical?: number) =>
    inRollback(prisma, async (db) => fn(await prepare(db, spec, physical)));

  it("crea el pago sin guardar el token en claro y reutiliza el intento vigente", async () => {
    await run(async ({ db, order, flow, pay, state }) => {
      const first = await pay();
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect((await pay()).body).toEqual(first.body);
      expect(flow.createPayment).toHaveBeenCalledTimes(1);
      expect(flow.created[0]).toMatchObject({
        amount: order.total,
        urlConfirmation: "https://api.test/api/v1/payments/flow/confirm",
      });
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
      const text = [payment.tokenHash, payment.redirectUrlEncrypted].join();
      expect(text).not.toContain(flow.token);
      expect((await state()).payments).toEqual(["pending"]);
    });
  });

  it("credencial de otro pedido o pedido inexistente: el mismo 404", async () => {
    await run(async ({ app, order }) => {
      for (const orderNumber of [`TK-${String(order.number)}`, "TK-99999999999"]) {
        const res = await request(app)
          .post("/api/v1/payments/flow/create")
          .set(csrfHeaders())
          .set("x-order-access", issueOrderAccess(testEnv.CSRF_SECRET ?? "", randomUUID()))
          .send({ orderNumber });
        expect(res.status).toBe(404);
      }
    });
  });

  it("pago verificado: confirma una sola vez aunque el callback se repita", async () => {
    await run(async ({ flow, pay, confirm, state }) => {
      await pay();
      flow.set({ status: "paid", media: "Webpay" });
      const expected = {
        order: "confirmed",
        payments: ["paid"],
        stock: [3, 0],
        emails: ["new_sale", "purchase_confirmed"],
      };
      expect((await confirm()).status).toBe(200);
      expect(await state()).toEqual(expected);
      expect((await confirm()).status).toBe(200);
      flow.set({ status: "rejected" });
      expect((await confirm()).status).toBe(200);
      expect(await state()).toEqual(expected);
      expect((await pay()).body).toMatchObject({ details: { reason: "already_paid" } });
    });
  });

  it("el carrito del pedido se elimina solo cuando el pago se confirma (LN-11)", async () => {
    await run(async ({ db, order, flow, pay, confirm }) => {
      const cart = await db.cart.create({
        data: { guestTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) },
      });
      await db.order.update({ where: { id: order.id }, data: { cartId: cart.id } });
      const cartExists = async () => (await db.cart.count({ where: { id: cart.id } })) === 1;

      await pay();
      flow.set({ status: "rejected" });
      await confirm();
      expect(await cartExists()).toBe(true);

      await pay();
      flow.set({ status: "paid" });
      await confirm();
      expect(await cartExists()).toBe(false);
      const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(saved).toMatchObject({ status: "confirmed", cartId: null });
    });
  });

  it("rechazo: libera stock y avisa; el reintento vuelve a reservar", async () => {
    await run(async ({ flow, pay, confirm, state }) => {
      await pay();
      flow.set({ status: "rejected" });
      await confirm();
      expect(await state()).toEqual({
        order: "pending_payment",
        payments: ["rejected"],
        stock: [5, 0],
        emails: ["payment_rejected"],
      });
      expect((await pay()).status).toBe(200);
      expect(await state()).toMatchObject({ payments: ["rejected", "pending"], stock: [5, 2] });
    });
  });

  it("monto distinto: no confirma y queda en revisión, sin auditoría duplicada", async () => {
    await run(async ({ db, order, flow, pay, confirm, state }) => {
      await pay();
      flow.set({ status: "paid", amount: 1 });
      expect((await confirm()).status).toBe(200);
      expect((await confirm()).status).toBe(200);
      expect(await state()).toMatchObject({
        order: "in_review",
        payments: ["in_review"],
        stock: [5, 2],
        // LN-15: una sola alerta al equipo, aunque el callback se repita.
        emails: ["payment_review_alert"],
      });
      const audits = { action: "payment.mismatch", resourceId: order.id };
      expect(await db.auditLog.count({ where: audits })).toBe(1);
    });
  });

  it("resultado incierto: queda en revisión y no abre otro intento", async () => {
    await run(async ({ flow, pay, state }) => {
      flow.createPayment.mockRejectedValueOnce(new FlowUncertainError("network"));
      for (let i = 0; i < 2; i += 1) {
        expect((await pay()).body).toMatchObject({ details: { reason: "payment_uncertain" } });
      }
      expect((await state()).payments).toEqual(["in_review"]);
      expect(flow.createPayment).toHaveBeenCalledTimes(1);
    });
  });

  it("Flow rechaza la creación: anula el intento y permite otro", async () => {
    await run(async ({ flow, pay, state }) => {
      flow.createPayment.mockRejectedValueOnce(new FlowRejectedError(400, 1));
      expect((await pay()).body).toMatchObject({ details: { reason: "payment_unavailable" } });
      expect((await pay()).status).toBe(200);
      expect((await state()).payments).toEqual(["voided", "pending"]);
    });
  });

  it("pago tardío: confirma si queda stock; si no, a revisión", async () => {
    for (const physical of [5, 1]) {
      await run(async ({ db, order, variant, flow, pay, confirm, state }) => {
        await pay();
        // El pedido venció y su stock se liberó antes de que llegara el pago.
        await db.stockReservation.updateMany({
          where: { orderId: order.id },
          data: { status: "released", resolvedAt: new Date() },
        });
        await db.productVariant.update({
          where: { id: variant.id },
          data: { stockReserved: 0, stockPhysical: physical },
        });
        await db.order.update({ where: { id: order.id }, data: { status: "expired" } });
        flow.set({ status: "paid" });
        expect((await confirm()).status).toBe(200);
        expect(await state()).toMatchObject(
          physical === 5
            ? { order: "confirmed", payments: ["paid"], stock: [3, 0] }
            : {
                order: "in_review",
                payments: ["paid"],
                stock: [1, 0],
                // LN-15: alerta al equipo (RN-05).
                emails: ["payment_review_alert"],
              },
        );
      });
    }
  });

  it("segundo cobro del mismo pedido: a revisión, sin segunda venta", async () => {
    await run(async ({ db, order, flow, pay, confirm, state }) => {
      await pay();
      const firstToken = flow.token;
      flow.set({ status: "rejected" });
      await confirm();
      await pay();
      flow.set({ status: "paid" });
      await confirm();
      flow.token = firstToken;
      flow.set({ status: "paid" });
      expect((await confirm()).status).toBe(200);
      expect(await state()).toMatchObject({ order: "confirmed", stock: [3, 0] });
      const audits = { action: "payment.double_charge", resourceId: order.id };
      expect(await db.auditLog.count({ where: audits })).toBe(1);
    });
  });

  it("plazo vencido: no se puede pagar", async () => {
    await run(
      async ({ pay }) => {
        expect((await pay()).body).toMatchObject({ details: { reason: "payment_expired" } });
      },
      { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    );
  });

  it("el retorno verifica y redirige con el pedido, sin estado en la URL", async () => {
    await run(async ({ app, order, flow, pay, state }) => {
      await pay();
      flow.set({ status: "paid" });
      const res = await request(app)
        .post("/api/v1/payments/flow/return")
        .type("form")
        .send({ token: flow.token });
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe(
        `http://localhost:3000/checkout/resultado?pedido=TK-${String(order.number)}`,
      );
      expect((await state()).order).toBe("confirmed");
    });
  });
});
