import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createLogger } from "../src/lib/logger.js";
import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { settlePayment } from "../src/services/flow/settle.js";
import { createPaymentJobs } from "../src/services/reconciliation/job.js";
import { reconcilePayment } from "../src/services/reconciliation/reconcile.js";
import { FLOW_GRACE_MS, RECONCILE_MAX_ATTEMPTS } from "../src/services/reconciliation/rules.js";
import { createCoupon } from "./cart-helpers.js";
import { FakeFlow } from "./fake-flow.js";
import { createOrder, createVariant, type OrderSpec } from "./order-fixtures.js";
import { inRollback } from "./panel-helpers.js";

// Job de conciliación y vencimientos (LN-15) contra totalkids_test. Flow es
// falso (FakeFlow). Cada caso corre en una transacción que se deshace, salvo el
// de concurrencia, que necesita conexiones reales y limpia lo que crea.
const url = process.env.TEST_DATABASE_URL;

const MIN = 60_000;
const ADMIN = "equipo@example.com";
const logger = createLogger("silent", false);

describe.skipIf(!url)("conciliación y vencimientos (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  afterAll(() => prisma.$disconnect());

  interface Setup {
    spec?: OrderSpec;
    physical?: number;
    coupon?: boolean;
    /** Cuánto antes de ahora vence el plazo de pago (por defecto 1 hora). */
    dueAgoMs?: number;
  }

  async function prepare(db: PrismaClient, setup: Setup = {}) {
    const physical = setup.physical ?? 5;
    const reservation = setup.spec?.status === "expired" ? "released" : "active";
    const variant = await createVariant(db, physical, reservation === "active" ? 2 : 0);
    const coupon = setup.coupon ? await createCoupon(db, { usesCount: 1 }) : null;
    const buyerEmail = `ln15-${randomUUID().slice(0, 8)}@correo.cl`;
    const order = await createOrder(db, {
      // createOrder pone el plazo 1 hora después de la creación.
      createdAt: new Date(Date.now() - (setup.dueAgoMs ?? 60 * MIN) - 60 * MIN),
      buyerEmail,
      lines: [{ variantId: variant.id, quantity: 2, reservation }],
      ...(coupon ? { couponId: coupon.id } : {}),
      ...setup.spec,
    });
    const flow = new FakeFlow();
    const payments = await db.payment.findMany({
      where: { orderId: order.id },
      orderBy: { attempt: "asc" },
    });
    for (const p of payments) flow.register(p);
    let clock = new Date();
    const jobs = createPaymentJobs({
      prisma: db,
      flow,
      logger,
      adminEmail: ADMIN,
      config: { batchSize: 10, intervalMs: 1000, scopeBuyerEmail: buyerEmail },
      now: () => clock,
    });
    const setClock = (at: Date) => {
      clock = at;
    };
    const state = async () => {
      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      const v = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      return {
        order: o.status,
        payments: (
          await db.payment.findMany({ where: { orderId: order.id }, orderBy: { attempt: "asc" } })
        ).map((p) => p.status),
        reservations: (await db.stockReservation.findMany({ where: { orderId: order.id } })).map(
          (r) => r.status,
        ),
        stock: [v.stockPhysical, v.stockReserved],
        emails: (await db.emailLog.findMany({ where: { orderId: order.id } }))
          .map((e) => e.event)
          .sort(),
        history: (
          await db.orderStatusHistory.findMany({
            where: { orderId: order.id },
            orderBy: { createdAt: "asc" },
          })
        ).map((h) => `${h.toStatus}:${h.actorLabel}`),
        movements: await db.inventoryMovement.count({ where: { orderId: order.id } }),
        coupon: coupon
          ? {
              redemption: (await db.couponRedemption.findUnique({ where: { orderId: order.id } }))
                ?.status,
              uses: (await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usesCount,
            }
          : null,
      };
    };
    const audits = (action: string) =>
      db.auditLog.findMany({ where: { resourceId: order.id, action } });
    return { db, order, variant, flow, jobs, payments, setClock, state, audits };
  }

  const run = (setup: Setup, fn: (ctx: Awaited<ReturnType<typeof prepare>>) => Promise<void>) =>
    inRollback(prisma, async (db) => fn(await prepare(db, setup)));

  const afterDue = (order: { paymentDueAt: Date }, ms: number) =>
    new Date(order.paymentDueAt.getTime() + ms);

  // ── Vencimiento ────────────────────────────────────────────────────────────

  it("vence un pedido sin pago: libera reservas y cupón, con historial y auditoría de Sistema", async () => {
    await run({ coupon: true }, async ({ jobs, state, audits }) => {
      const result = await jobs.runOnce();
      expect(result.expired).toBe(1);
      const s = await state();
      expect(s).toMatchObject({
        order: "expired",
        reservations: ["released"],
        stock: [5, 0],
        history: ["expired:Sistema"],
        coupon: { redemption: "released", uses: 0 },
      });
      const [audit] = await audits("order.expired");
      expect(audit).toMatchObject({ actorLabel: "Sistema", actorUserId: null });
    });
  });

  it("correr el job dos veces no duplica liberaciones, cupón, historial ni correos", async () => {
    await run({ coupon: true }, async ({ jobs, state, audits }) => {
      await jobs.runOnce();
      const first = await state();
      const again = await jobs.runOnce();
      expect(again.expired).toBe(0);
      expect(await state()).toEqual(first);
      expect(first.movements).toBe(1);
      expect(await audits("order.expired")).toHaveLength(1);
    });
  });

  it("no vence un pedido con el plazo vigente", async () => {
    await run({ dueAgoMs: -30 * MIN }, async ({ jobs, state }) => {
      expect((await jobs.runOnce()).expired).toBe(0);
      expect((await state()).order).toBe("pending_payment");
    });
  });

  // ── Pago abierto: se consulta a Flow antes de vencer (RN-04) ─────────────────

  it("no vence con un pago abierto que Flow informa pendiente dentro del margen", async () => {
    await run(
      { spec: { payments: ["pending"] } },
      async ({ db, jobs, order, flow, setClock, state, payments }) => {
        setClock(afterDue(order, MIN));
        const result = await jobs.runOnce();
        expect(result.expired).toBe(0);
        expect(result.reconciled).toEqual([{ paymentId: payments[0]?.id, outcome: "waiting" }]);
        expect(flow.getStatusByCommerceOrder).toHaveBeenCalledTimes(1);
        expect(await state()).toMatchObject({
          order: "pending_payment",
          payments: ["pending"],
          reservations: ["active"],
        });
        const payment = await db.payment.findUniqueOrThrow({ where: { id: payments[0]?.id } });
        expect(payment.nextCheckAt?.getTime()).toBe(afterDue(order, 3 * MIN).getTime());
        // Antes de la próxima consulta no se vuelve a preguntar.
        await jobs.runOnce();
        expect(flow.getStatusByCommerceOrder).toHaveBeenCalledTimes(1);
      },
    );
  });

  it("vence el intento y el pedido cuando Flow lo sigue informando pendiente pasado el margen", async () => {
    await run(
      { spec: { payments: ["pending"] }, coupon: true },
      async ({ jobs, order, setClock, state }) => {
        setClock(afterDue(order, FLOW_GRACE_MS));
        await jobs.runOnce();
        expect(await state()).toMatchObject({
          order: "expired",
          payments: ["expired"],
          reservations: ["released"],
          stock: [5, 0],
          coupon: { redemption: "released", uses: 0 },
        });
      },
    );
  });

  it("Flow pagado: confirma y descuenta el stock", async () => {
    await run(
      { spec: { payments: ["pending"] } },
      async ({ jobs, order, flow, payments, setClock, state }) => {
        flow.register(payments[0] ?? { commerceOrder: "", amount: 0 }, { status: "paid" });
        setClock(afterDue(order, MIN));
        await jobs.runOnce();
        expect(await state()).toMatchObject({
          order: "confirmed",
          payments: ["paid"],
          reservations: ["consumed"],
          stock: [3, 0],
          emails: ["new_sale", "purchase_confirmed"],
        });
      },
    );
  });

  it("Flow rechazado: libera y vence (con el cupón)", async () => {
    await run(
      { spec: { payments: ["pending"] }, coupon: true },
      async ({ jobs, order, flow, payments, setClock, state }) => {
        flow.register(payments[0] ?? { commerceOrder: "", amount: 0 }, { status: "rejected" });
        setClock(afterDue(order, MIN));
        await jobs.runOnce();
        expect(await state()).toMatchObject({
          order: "expired",
          payments: ["rejected"],
          reservations: ["released"],
          stock: [5, 0],
          emails: ["payment_rejected"],
          coupon: { redemption: "released", uses: 0 },
        });
      },
    );
  });

  // ── Flow sin respuesta: revisión con alerta, nunca vencer (RN-04) ────────────

  it("Flow caído con el plazo vencido: pedido y pago en revisión, con una sola alerta", async () => {
    await run(
      { spec: { payments: ["pending"] } },
      async ({ db, jobs, order, flow, payments, setClock, state, audits }) => {
        flow.uncertain();
        setClock(afterDue(order, MIN));
        const first = await jobs.runOnce();
        expect(first.reconciled[0]?.outcome).toBe("in_review");
        expect(await state()).toMatchObject({
          order: "in_review",
          payments: ["in_review"],
          reservations: ["in_review"],
          stock: [5, 2],
          emails: ["payment_review_alert"],
          history: ["in_review:Sistema"],
        });
        // Más tarde, Flow sigue caído: nada se duplica.
        setClock(afterDue(order, 60 * MIN));
        await jobs.runOnce();
        const s = await state();
        expect(s.emails).toEqual(["payment_review_alert"]);
        expect(s.history).toEqual(["in_review:Sistema"]);
        expect(await audits("payment.flow_unreachable")).toHaveLength(1);
        const payment = await db.payment.findUniqueOrThrow({ where: { id: payments[0]?.id } });
        expect(payment.reconcileAttempts).toBe(2);

        // Flow vuelve y confirma el pago: se concilia solo (pago tardío con stock).
        flow.recover();
        flow.register(payments[0] ?? { commerceOrder: "", amount: 0 }, { status: "paid" });
        setClock(afterDue(order, 3 * 60 * MIN));
        await jobs.runOnce();
        expect(await state()).toMatchObject({
          order: "confirmed",
          payments: ["paid"],
          reservations: ["consumed"],
          stock: [3, 0],
        });
        const done = await db.payment.findUniqueOrThrow({ where: { id: payments[0]?.id } });
        expect(done).toMatchObject({ reconcileAttempts: 0, nextCheckAt: null });
      },
    );
  });

  it("Flow vuelve y confirma que no hubo cobro: el pedido en revisión vence", async () => {
    await run(
      { spec: { payments: ["pending"] }, coupon: true },
      async ({ jobs, order, flow, payments, setClock, state }) => {
        flow.uncertain();
        setClock(afterDue(order, MIN));
        await jobs.runOnce();
        flow.recover();
        flow.register(payments[0] ?? { commerceOrder: "", amount: 0 }, { status: "voided" });
        setClock(afterDue(order, 2 * 60 * MIN));
        await jobs.runOnce();
        expect(await state()).toMatchObject({
          order: "expired",
          payments: ["voided"],
          reservations: ["released"],
          stock: [5, 0],
          coupon: { redemption: "released", uses: 0 },
        });
      },
    );
  });

  it.each([
    ["401 (credenciales)", 401, null],
    ["firma inválida", 400, 108],
    ["orden no encontrada", 400, 105],
  ] as const)(
    "un 4xx de Flow (%s) nunca anula ni vence el pago: queda en revisión",
    async (_label, httpStatus, flowCode) => {
      await run(
        { spec: { payments: ["in_review"] } },
        async ({ jobs, order, flow, setClock, state }) => {
          flow.rejects(httpStatus, flowCode);
          setClock(afterDue(order, 2 * 60 * MIN));
          await jobs.runOnce();
          expect(await state()).toMatchObject({
            order: "in_review",
            payments: ["in_review"],
            reservations: ["in_review"],
            stock: [5, 2],
            emails: ["payment_review_alert"],
          });
        },
      );
    },
  );

  it(`tras ${String(RECONCILE_MAX_ATTEMPTS)} consultas inciertas con el plazo vigente, revisión con una alerta`, async () => {
    await run(
      { spec: { payments: ["pending"] }, dueAgoMs: -30 * MIN },
      async ({ db, jobs, flow, payments, state }) => {
        flow.uncertain();
        const paymentId = payments[0]?.id ?? "";
        const attempts = async () =>
          (await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).reconcileAttempts;

        // El reclamo del worker no suma intentos: solo la consulta incierta.
        const first = await jobs.runOnce();
        expect(first.reconciled).toEqual([{ paymentId, outcome: "uncertain" }]);
        expect(await attempts()).toBe(1);

        const deps = { prisma: db, flow, adminEmail: ADMIN };
        for (let n = 2; n < RECONCILE_MAX_ATTEMPTS; n += 1) {
          expect((await reconcilePayment(deps, paymentId)).outcome).toBe("uncertain");
          expect(await attempts()).toBe(n);
        }
        expect((await state()).order).toBe("pending_payment");
        expect((await reconcilePayment(deps, paymentId)).outcome).toBe("in_review");
        expect(await attempts()).toBe(RECONCILE_MAX_ATTEMPTS);
        expect(await state()).toMatchObject({
          order: "in_review",
          payments: ["in_review"],
          emails: ["payment_review_alert"],
        });
        await reconcilePayment(deps, paymentId);
        expect((await state()).emails).toEqual(["payment_review_alert"]);
      },
    );
  });

  // ── Pago tardío (RN-05) ──────────────────────────────────────────────────────

  async function latePayment(db: PrismaClient, orderId: string) {
    const payment = await db.payment.findFirstOrThrow({ where: { orderId } });
    const status = {
      flowOrder: 123_456,
      commerceOrder: payment.commerceOrder,
      status: "paid" as const,
      amount: payment.amount,
      currency: "CLP",
      media: "Webpay",
    };
    return settlePayment(db, { status, adminEmail: ADMIN });
  }

  it("pago tardío con stock: confirma el pedido vencido", async () => {
    await run(
      { spec: { status: "expired", payments: ["expired"] } },
      async ({ db, order, state }) => {
        expect((await latePayment(db, order.id)).outcome).toBe("confirmed");
        expect(await state()).toMatchObject({ order: "confirmed", stock: [3, 0] });
      },
    );
  });

  it("pago tardío sin stock: revisión con una sola alerta, sin vender", async () => {
    await run(
      { spec: { status: "expired", payments: ["expired"] }, physical: 1 },
      async ({ db, order, state }) => {
        expect((await latePayment(db, order.id)).outcome).toBe("late_review");
        expect((await latePayment(db, order.id)).outcome).toBe("unchanged");
        expect(await state()).toMatchObject({
          order: "in_review",
          payments: ["paid"],
          reservations: ["released"],
          stock: [1, 0],
          emails: ["payment_review_alert"],
        });
      },
    );
  });

  // ── Dos workers a la vez ─────────────────────────────────────────────────────

  it("dos workers a la vez: cada pedido vence una vez y cada pago se consulta una vez", async () => {
    const other = createPrismaClient(url ?? "");
    const buyerEmail = `ln15-conc-${randomUUID().slice(0, 8)}@correo.cl`;
    const variant = await createVariant(prisma, 20, 8);
    const orders = [];
    for (let i = 0; i < 4; i += 1) {
      orders.push(
        await createOrder(prisma, {
          createdAt: new Date(Date.now() - 2 * 60 * MIN),
          buyerEmail,
          lines: [{ variantId: variant.id, quantity: 2, reservation: "active" }],
          ...(i === 0 ? { payments: ["pending"] } : {}),
        }),
      );
    }
    const ids = orders.map((o) => o.id);
    try {
      const flow = new FakeFlow();
      const [open] = await prisma.payment.findMany({ where: { orderId: { in: ids } } });
      if (open) flow.register(open, { status: "rejected" });
      const make = (db: PrismaClient) =>
        createPaymentJobs({
          prisma: db,
          flow,
          logger,
          adminEmail: ADMIN,
          config: { batchSize: 10, intervalMs: 1000, scopeBuyerEmail: buyerEmail },
        });
      const runs = await Promise.all([make(prisma).runOnce(), make(other).runOnce()]);

      expect(runs.reduce((n, r) => n + r.expired, 0)).toBeLessThanOrEqual(4);
      expect(runs.flatMap((r) => r.reconciled)).toHaveLength(1);
      expect(flow.getStatusByCommerceOrder).toHaveBeenCalledTimes(1);

      const after = await prisma.order.findMany({ where: { id: { in: ids } } });
      expect(after.map((o) => o.status)).toEqual(["expired", "expired", "expired", "expired"]);
      for (const id of ids) {
        expect(await prisma.inventoryMovement.count({ where: { orderId: id } })).toBe(1);
        expect(
          await prisma.orderStatusHistory.count({ where: { orderId: id, toStatus: "expired" } }),
        ).toBe(1);
      }
      expect(await prisma.emailLog.count({ where: { orderId: { in: ids } } })).toBe(1);
      const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      expect([v.stockPhysical, v.stockReserved]).toEqual([20, 0]);
    } finally {
      await other.$disconnect();
      const emails = await prisma.emailLog.findMany({ where: { orderId: { in: ids } } });
      await prisma.emailLog.deleteMany({ where: { id: { in: emails.map((e) => e.id) } } });
      await prisma.outboxJob.deleteMany({
        where: { eventKey: { in: emails.map((e) => e.eventKey) } },
      });
      await prisma.inventoryMovement.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.stockReservation.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: ids } } });
      await prisma.productVariant.delete({ where: { id: variant.id } });
      const product = await prisma.product.findUniqueOrThrow({ where: { id: variant.productId } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: product.categoryId } });
    }
  });
});
