import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { chileDate } from "../src/services/cart/chile-date.js";
import { FakeFlow } from "./fake-flow.js";
import { buildTestApp } from "./helpers.js";
import { createOrder, createVariant, type OrderSpec } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Conciliación manual del panel (LN-15, RF-33): «Consultar en Flow» y
// resolución con motivo, contra totalkids_test. Flow es falso.
const url = process.env.TEST_DATABASE_URL;
const api = (path: string) => `/api/v1/admin${path}`;

describe.skipIf(!url)("/admin/payments/{id}/reconcile y /resolve", () => {
  const prisma = createPrismaClient(url ?? "");
  let admin = "";
  let operator = "";

  beforeAll(async () => {
    admin = (await panelSession(prisma, "admin")).token;
    operator = (await panelSession(prisma, "operator")).token;
  });
  afterAll(() => prisma.$disconnect());

  interface Ctx {
    db: PrismaClient;
    app: ReturnType<typeof buildTestApp>;
    flow: FakeFlow;
    order: Awaited<ReturnType<typeof createOrder>>;
    payments: { id: string; commerceOrder: string; amount: number }[];
    variantId: string;
    state: () => Promise<{ order: string; payments: string[]; stock: number[]; emails: string[] }>;
  }

  async function prepare(
    db: PrismaClient,
    spec: OrderSpec,
    opts: { physical?: number; reserved?: number; withFlow?: boolean } = {},
  ): Promise<Ctx> {
    const { lines, ...rest } = spec;
    const reservation = lines?.[0]?.reservation;
    const variant = await createVariant(db, opts.physical ?? 5, opts.reserved ?? 0);
    const order = await createOrder(db, {
      ...rest,
      lines: [{ variantId: variant.id, quantity: 2, ...(reservation ? { reservation } : {}) }],
    });
    const payments = await db.payment.findMany({
      where: { orderId: order.id },
      orderBy: { attempt: "asc" },
    });
    const flow = new FakeFlow();
    for (const p of payments) flow.register(p);
    const app = buildTestApp({
      prisma: db,
      ...(opts.withFlow === false
        ? {}
        : { flow: { client: flow, callbackBase: "https://api.test/api/v1", sealSecret: "clave" } }),
    });
    const state = async () => {
      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      const v = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      return {
        order: o.status,
        payments: (
          await db.payment.findMany({ where: { orderId: order.id }, orderBy: { attempt: "asc" } })
        ).map((p) => p.status),
        stock: [v.stockPhysical, v.stockReserved],
        emails: (await db.emailLog.findMany({ where: { orderId: order.id } }))
          .map((e) => e.event)
          .sort(),
      };
    };
    return { db, app, flow, order, payments, variantId: variant.id, state };
  }

  const run = (
    spec: OrderSpec,
    fn: (ctx: Ctx) => Promise<void>,
    opts?: Parameters<typeof prepare>[2],
  ) => inRollback(prisma, async (db) => fn(await prepare(db, spec, opts)));

  const reconcile = (ctx: Ctx, id: string, token: string, csrf = true) =>
    request(ctx.app)
      .post(api(`/payments/${id}/reconcile`))
      .set(panelHeaders(token, csrf));
  const resolve = (ctx: Ctx, id: string, body: object, token = admin) =>
    request(ctx.app)
      .post(api(`/payments/${id}/resolve`))
      .set(panelHeaders(token))
      .send(body);

  const pendingDue: OrderSpec = {
    payments: ["pending"],
    lines: [{ reservation: "active" }],
  };

  // ── Consultar en Flow ────────────────────────────────────────────────────────

  it("Administrador y Operador consultan en Flow y se asienta el pago", async () => {
    await run(
      pendingDue,
      async (ctx) => {
        const id = ctx.payments[0]?.id ?? "";
        const [payment] = ctx.payments;
        if (payment) ctx.flow.register(payment, { status: "paid" });
        const res = await reconcile(ctx, id, operator);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({
          outcome: "confirmed",
          flowStatus: "paid",
          payment: { id, status: "paid", reconcilable: false },
        });
        expect(await ctx.state()).toMatchObject({ order: "confirmed", stock: [3, 0] });

        // Ya no es conciliable: 409 con el mensaje del panel.
        const again = await reconcile(ctx, id, admin);
        expect(again.status).toBe(409);
        expect(again.body.message).toBe(
          "Solo se consulta en Flow el último intento pendiente o en revisión.",
        );
      },
      { reserved: 2 },
    );
  });

  it("Flow caído desde el panel: el pago no se anula y el pedido queda en revisión", async () => {
    await run(
      pendingDue,
      async (ctx) => {
        ctx.flow.rejects(401);
        const res = await reconcile(ctx, ctx.payments[0]?.id ?? "", admin);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ outcome: "in_review", flowStatus: null });
        expect(await ctx.state()).toMatchObject({
          order: "in_review",
          payments: ["in_review"],
          stock: [5, 2],
          emails: ["payment_review_alert"],
        });
      },
      { reserved: 2 },
    );
  });

  it("sin sesión 401, sin CSRF 403, sin Flow configurado 409, pago inexistente 404", async () => {
    await run(
      pendingDue,
      async (ctx) => {
        const id = ctx.payments[0]?.id ?? "";
        const anonymous = await request(ctx.app)
          .post(api(`/payments/${id}/reconcile`))
          .set(panelHeaders());
        expect(anonymous.status).toBe(401);
        expect((await reconcile(ctx, id, admin, false)).status).toBe(403);
        const disabled = await reconcile(ctx, id, admin);
        expect(disabled.status).toBe(409);
        expect(disabled.body.message).toBe(
          "Flow no está configurado: no se puede consultar el pago.",
        );
        expect((await reconcile(ctx, "0195f3a0-0000-7000-8000-0000000000ff", admin)).status).toBe(
          404,
        );
        expect((await reconcile(ctx, "no-es-uuid", admin)).status).toBe(422);
      },
      { reserved: 2, withFlow: false },
    );
  });

  // ── Resolución manual (solo Administrador) ───────────────────────────────────

  it("liberar: el intento queda anulado y el pedido vence, liberando el stock", async () => {
    await run(
      { status: "in_review", payments: ["in_review"], lines: [{ reservation: "in_review" }] },
      async (ctx) => {
        const id = ctx.payments[0]?.id ?? "";
        const body = { action: "release", reason: "Revisado en el portal de Flow: sin cobro" };

        const forbidden = await resolve(ctx, id, body, operator);
        expect(forbidden.status).toBe(403);
        const short = await resolve(ctx, id, { action: "release", reason: "x" });
        expect(short.status).toBe(422);

        const res = await resolve(ctx, id, body);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({
          resolution: "release",
          payment: { status: "voided", resolutions: [] },
        });
        expect(await ctx.state()).toMatchObject({
          order: "expired",
          payments: ["voided"],
          stock: [5, 0],
        });
        const [audit] = await ctx.db.auditLog.findMany({
          where: { resourceId: ctx.order.id, action: "payment.resolved" },
        });
        expect(audit).toMatchObject({ actorLabel: "Administrador", reason: body.reason });

        // Ya resuelto: no admite otra resolución.
        const again = await resolve(ctx, id, body);
        expect(again.status).toBe(409);
      },
      { reserved: 2 },
    );
  });

  it("doble cobro: no se puede liberar; queda como reembolso pendiente sin tocar el pedido", async () => {
    await run({ status: "confirmed", payments: ["paid", "in_review"] }, async (ctx) => {
      const second = ctx.payments[1]?.id ?? "";
      await ctx.db.payment.update({
        where: { id: second },
        data: { providerResponse: { status: "paid" } },
      });
      const release = await resolve(ctx, second, {
        action: "release",
        reason: "Intento de liberar",
      });
      expect(release.status).toBe(409);
      expect(release.body.message).toBe(
        "Flow informó este pago como pagado: márcalo como reembolso pendiente.",
      );

      const res = await resolve(ctx, second, {
        action: "refund_pending",
        reason: "Doble cobro: se devuelve por transferencia",
      });
      expect(res.status).toBe(200);
      expect(res.body.payment).toMatchObject({
        status: "refund_pending",
        statusLabel: "Reembolso pendiente",
      });
      expect(await ctx.state()).toMatchObject({
        order: "confirmed",
        payments: ["paid", "refund_pending"],
      });
    });
  });

  it("pago tardío: confirmar exige stock; con stock confirma y encola la venta", async () => {
    const late: OrderSpec = {
      status: "in_review",
      payments: ["paid"],
      lines: [{ reservation: "released" }],
    };
    await run(
      late,
      async (ctx) => {
        const res = await resolve(ctx, ctx.payments[0]?.id ?? "", {
          action: "confirm",
          reason: "Llegó stock",
        });
        expect(res.status).toBe(409);
        expect(res.body.message).toBe(
          "Aún no hay stock para todas las unidades: ajusta el inventario o márcalo como reembolso pendiente.",
        );
        // Tampoco se puede confirmar a mano desde el cambio de estado (no descontaría stock).
        const patch = await request(ctx.app)
          .patch(api(`/orders/${ctx.order.id}/status`))
          .set(panelHeaders(admin))
          .send({ to: "confirmed", reason: "Confirmar a mano" });
        expect(patch.status).toBe(409);
        expect(await ctx.state()).toMatchObject({ order: "in_review", stock: [1, 0] });
      },
      { physical: 1 },
    );
    await run(
      late,
      async (ctx) => {
        const res = await resolve(ctx, ctx.payments[0]?.id ?? "", {
          action: "confirm",
          reason: "Llegó stock",
        });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(await ctx.state()).toMatchObject({
          order: "confirmed",
          stock: [3, 0],
          emails: ["new_sale", "purchase_confirmed"],
        });
        const movement = await ctx.db.inventoryMovement.findFirstOrThrow({
          where: { orderId: ctx.order.id, kind: "sale" },
        });
        expect(movement.actorLabel).toBe("Administrador");
      },
      { physical: 5 },
    );
  });

  it("pago tardío sin stock como reembolso pendiente: se cancela y se puede registrar la devolución", async () => {
    await run(
      { status: "in_review", payments: ["paid"], lines: [{ reservation: "released" }] },
      async (ctx) => {
        const res = await resolve(ctx, ctx.payments[0]?.id ?? "", {
          action: "refund_pending",
          reason: "Sin stock: se devuelve el pago",
        });
        expect(res.status).toBe(200);
        expect(await ctx.state()).toMatchObject({ order: "cancelled", payments: ["paid"] });
        const refund = await request(ctx.app)
          .post(api(`/orders/${ctx.order.id}/refund-records`))
          .set(panelHeaders(admin))
          .send({
            amount: ctx.order.total,
            date: chileDate(),
            reference: "TRF-123",
            status: "requested",
          });
        expect(refund.status, JSON.stringify(refund.body)).toBe(201);
      },
      { physical: 1 },
    );
  });

  // ── Listas, detalle y resumen ────────────────────────────────────────────────

  it("detalle, listado y resumen muestran conciliación, resoluciones y alertas abiertas", async () => {
    await run(
      { status: "in_review", payments: ["in_review"], lines: [{ reservation: "in_review" }] },
      async (ctx) => {
        await ctx.db.auditLog.create({
          data: {
            actorLabel: "Sistema",
            action: "payment.flow_unreachable",
            resourceType: "order",
            resourceId: ctx.order.id,
            details: { paymentId: ctx.payments[0]?.id ?? "" },
          },
        });
        const detail = await request(ctx.app)
          .get(api(`/orders/${ctx.order.id}`))
          .set(panelHeaders(operator));
        expect(detail.body.payments[0]).toMatchObject({
          reconcilable: true,
          resolutions: ["release"],
        });
        const list = await request(ctx.app)
          .get(api(`/payments?order=${ctx.order.id}`))
          .set(panelHeaders(operator));
        expect(list.body.items[0]).toMatchObject({
          reconcilable: true,
          resolutions: ["release"],
          orderStatus: "in_review",
          reconcileAttempts: 0,
        });
        const summary = await request(ctx.app).get(api("/summary")).set(panelHeaders(operator));
        expect(summary.status).toBe(200);
        expect(summary.body.alerts.total).toBeGreaterThanOrEqual(1);
        expect(summary.body.alerts.items).toContainEqual(
          expect.objectContaining({
            orderId: ctx.order.id,
            orderRef: `TK-${String(ctx.order.number)}`,
            reason: "flow_unreachable",
          }),
        );

        await resolve(ctx, ctx.payments[0]?.id ?? "", {
          action: "release",
          reason: "Sin cobro en Flow",
        });
        const closed = await request(ctx.app).get(api("/summary")).set(panelHeaders(admin));
        expect(closed.body.alerts.total).toBe(summary.body.alerts.total - 1);
      },
      { reserved: 2 },
    );
  });

  it("refund_pending no cuenta como cobro en reportes, resumen ni CSV", async () => {
    await inRollback(prisma, async (db) => {
      const app = buildTestApp({ prisma: db });
      const h = panelHeaders(admin);
      const period = "from=2019-06-01&to=2019-06-30";
      const report = () =>
        request(app)
          .get(api(`/reports/sales?${period}`))
          .set(h);
      const csv = () =>
        request(app)
          .get(api(`/exports/sales?${period}`))
          .set(h)
          .buffer(true)
          .parse((res, done) => {
            let text = "";
            res.setEncoding("utf8");
            res.on("data", (chunk: string) => (text += chunk));
            res.on("end", () => done(null, text));
          });
      const summary = () => request(app).get(api("/summary")).set(h);

      const before = [(await report()).body, (await csv()).body as string, (await summary()).body];
      await createOrder(db, {
        status: "cancelled",
        payments: ["refund_pending"],
        amount: 77_000,
        createdAt: new Date("2019-06-10T12:00:00Z"),
        paidAt: new Date("2019-06-10T13:00:00Z"),
      });
      const now = new Date();
      await createOrder(db, {
        status: "confirmed",
        payments: ["paid", "refund_pending"],
        createdAt: now,
        paidAt: now,
      });
      const order = await createOrder(db, {
        status: "cancelled",
        payments: ["refund_pending"],
        amount: 55_000,
      });
      const after = [(await report()).body, (await csv()).body as string, (await summary()).body];

      expect(after[0].charged).toBe(before[0].charged);
      expect(after[1]).toBe(before[1]);
      // El mes en curso: solo suma el pedido con un intento pagado.
      expect(after[2].sales.charged - before[2].sales.charged).toBe(30_000);

      const list = await request(app)
        .get(api(`/payments?order=${order.id}&status=refund_pending`))
        .set(h);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.counts.refund_pending).toBe(1);
    });
  });
});
