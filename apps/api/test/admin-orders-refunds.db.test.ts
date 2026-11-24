import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { chileDate } from "../src/services/cart/chile-date.js";
import { buildTestApp } from "./helpers.js";
import { createOrder } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Reembolsos manuales del panel (LN-13, RF-32) contra totalkids_test. Los casos
// simples corren en transacciones que se deshacen; el de concurrencia usa
// conexiones reales y borra lo suyo al final. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

type App = ReturnType<typeof buildTestApp>;
type Body = Record<string, unknown>;

const DAY = 24 * 60 * 60 * 1000;
const today = () => chileDate(new Date());

describe.skipIf(!url)("reembolsos manuales del panel (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const committed: string[] = [];
  let admin = "";
  let operator = "";

  beforeAll(async () => {
    admin = (await panelSession(prisma, "admin")).token;
    operator = (await panelSession(prisma, "operator")).token;
  });

  afterAll(async () => {
    await prisma.refundRecord.deleteMany({ where: { orderId: { in: committed } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: committed } } });
    await prisma.order.deleteMany({ where: { id: { in: committed } } });
    await prisma.$disconnect();
  });

  const run = (fn: (db: PrismaClient, app: App) => Promise<void>) =>
    inRollback(prisma, (db) => fn(db, buildTestApp({ prisma: db })));

  const record = (app: App, id: string, body: Body, headers = panelHeaders(admin)) =>
    request(app).post(`/api/v1/admin/orders/${id}/refund-records`).set(headers).send(body);

  const resolve = (
    app: App,
    id: string,
    refundId: string,
    status: string,
    headers = panelHeaders(admin),
  ) =>
    request(app)
      .patch(`/api/v1/admin/orders/${id}/refund-records/${refundId}`)
      .set(headers)
      .send({ status });

  const refund = (extra: Body = {}) => ({
    amount: 10_000,
    date: today(),
    reference: "Transferencia 4471",
    status: "requested",
    ...extra,
  });

  /** Pedido pagado: 30.000 cobrados (retiro en taller). */
  const paidOrder = (db: PrismaClient) =>
    createOrder(db, { status: "confirmed", payments: ["paid"], amount: 30_000 });

  function issues(res: request.Response) {
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    const list = (res.body as { details: { issues: { path: string; message: string }[] } }).details
      .issues;
    return Object.fromEntries(list.map((i) => [i.path, i.message]));
  }

  function expectConflict(res: request.Response, message: string, field = "form") {
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body).toMatchObject({ code: "CONFLICT", message, details: { field } });
  }

  describe("permisos", () => {
    it("solo el Administrador: Operador 403 al registrar y al resolver; sin sesión 401", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        expect((await record(app, order.id, refund(), panelHeaders(operator))).status).toBe(403);
        expect((await record(app, order.id, refund(), panelHeaders(undefined))).status).toBe(401);
        const created = await record(app, order.id, refund());
        expect(created.status).toBe(201);
        const id = (created.body as { refund: { id: string } }).refund.id;
        const denied = await resolve(app, order.id, id, "processed", panelHeaders(operator));
        expect(denied.status).toBe(403);
      });
    });
  });

  describe("registrar", () => {
    it("201 con el registro y los totales; no cambia el pago ni el estado; audita", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        const before = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });

        const res = await record(app, `TK-${String(order.number)}`, refund({ amount: 12_500 }));
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(res.body).toMatchObject({
          refund: {
            paymentId: before.id,
            amount: 12_500,
            date: today(),
            reference: "Transferencia 4471",
            status: "requested",
            statusLabel: "Solicitado",
            registeredBy: "Administrador",
            resolvedAt: null,
          },
          refundTotals: {
            charged: 30_000,
            committed: 12_500,
            processed: 0,
            refundable: 17_500,
            state: "requested",
          },
        });

        const after = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
        expect(after).toEqual(before);
        const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(saved.status).toBe("confirmed");

        const audit = await db.auditLog.findMany({
          where: { resourceId: order.id, action: "order.refund_recorded" },
        });
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({
          actorLabel: "Administrador",
          reason: "Referencia Transferencia 4471",
          details: { amount: 12_500, status: "requested", paymentId: before.id },
        });

        const detail = await request(app)
          .get(`/api/v1/admin/orders/${order.id}`)
          .set(panelHeaders(admin));
        expect(detail.body).toMatchObject({
          refunds: [{ amount: 12_500 }],
          refundTotals: { refundable: 17_500 },
          payment: { status: "paid" },
        });
      });
    });

    it("ya procesado por fuera: queda resuelto al registrarse", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        const res = await record(app, order.id, refund({ status: "processed" }));
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
          refund: { status: "processed", resolvedBy: "Administrador" },
          refundTotals: { processed: 10_000, state: "processed" },
        });
        expect((res.body as { refund: { resolvedAt: string } }).refund.resolvedAt).toBeTruthy();
      });
    });

    it("409 si el pedido no tiene un pago confirmado", async () => {
      await run(async (db, app) => {
        for (const payments of [[], ["pending"], ["rejected"], ["in_review"]] as const) {
          const order = await createOrder(db, { payments: [...payments] });
          expectConflict(
            await record(app, order.id, refund()),
            "Solo se registran reembolsos de pedidos con pago confirmado.",
          );
          expect(await db.refundRecord.count({ where: { orderId: order.id } })).toBe(0);
        }
      });
    });

    it("errores de forma: 422 por campo con el texto del panel", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        expect(
          issues(
            await record(app, order.id, {
              amount: 10.5,
              date: "2026-02-30",
              reference: "ab",
              status: "failed",
            }),
          ),
        ).toEqual({
          amount: "Ingresa un monto entero en CLP mayor que 0.",
          date: "Ingresa la fecha del reembolso.",
          reference: "Ingresa la referencia del comprobante.",
          status: "Elige si el reembolso está solicitado o ya procesado.",
        });
        expect(issues(await record(app, order.id, refund({ amount: 0 })))).toEqual({
          amount: "Ingresa un monto entero en CLP mayor que 0.",
        });
        expect(issues(await record(app, order.id, refund({ reference: "x".repeat(121) })))).toEqual(
          { reference: "La referencia admite hasta 120 caracteres." },
        );
        // La referencia se guarda sin espacios sobrantes.
        const trimmed = await record(app, order.id, refund({ reference: "  4471   " }));
        expect(trimmed.status).toBe(201);
        expect(trimmed.body).toMatchObject({ refund: { reference: "4471" } });
      });
    });

    it("tope: nunca supera lo cobrado, con lo que queda en el mensaje", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        expect((await record(app, order.id, refund({ amount: 20_000 }))).status).toBe(201);
        expect(issues(await record(app, order.id, refund({ amount: 10_001 })))).toEqual({
          amount: "El monto supera lo cobrado: quedan $10.000 por registrar.",
        });
        expect((await record(app, order.id, refund({ amount: 10_000 }))).status).toBe(201);
        expect(issues(await record(app, order.id, refund({ amount: 1 })))).toEqual({
          amount: "El pedido ya tiene registrado todo lo cobrado.",
        });
      });
    });

    it("fechas en días de Chile: ni futura ni anterior al cobro", async () => {
      await run(async (db, app) => {
        const paidAt = new Date(Date.now() - 2 * DAY);
        const order = await createOrder(db, {
          status: "confirmed",
          payments: ["paid"],
          createdAt: new Date(Date.now() - 5 * DAY),
          paidAt,
        });
        expect(
          issues(
            await record(app, order.id, refund({ date: chileDate(new Date(Date.now() + DAY)) })),
          ),
        ).toEqual({ date: "La fecha del reembolso no puede ser futura." });
        expect(
          issues(
            await record(
              app,
              order.id,
              refund({ date: chileDate(new Date(paidAt.getTime() - DAY)) }),
            ),
          ),
        ).toEqual({ date: "La fecha no puede ser anterior al cobro." });
        // El mismo día del cobro y hoy, sí.
        expect((await record(app, order.id, refund({ date: chileDate(paidAt) }))).status).toBe(201);
        expect((await record(app, order.id, refund({ date: today() }))).status).toBe(201);
      });
    });

    it("404 si el pedido no existe", async () => {
      await run(async (_db, app) => {
        const res = await record(app, randomUUID(), refund());
        expect(res.status).toBe(404);
      });
    });
  });

  describe("resolver", () => {
    it("un solicitado se resuelve una sola vez y queda auditado", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        const created = await record(app, order.id, refund());
        const id = (created.body as { refund: { id: string } }).refund.id;

        const done = await resolve(app, order.id, id, "processed");
        expect(done.status, JSON.stringify(done.body)).toBe(200);
        expect(done.body).toMatchObject({
          refund: { id, status: "processed", resolvedBy: "Administrador" },
          refundTotals: { processed: 10_000, state: "processed" },
        });
        expectConflict(
          await resolve(app, order.id, id, "failed"),
          "Ese reembolso ya fue resuelto.",
        );

        const audit = await db.auditLog.findMany({
          where: { resourceId: order.id, action: "order.refund_resolved" },
        });
        expect(audit).toHaveLength(1);
        expect(audit[0]?.details).toMatchObject({
          refundId: id,
          from: "requested",
          to: "processed",
        });
      });
    });

    it("uno registrado como procesado ya está resuelto", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        const created = await record(app, order.id, refund({ status: "processed" }));
        const id = (created.body as { refund: { id: string } }).refund.id;
        expectConflict(
          await resolve(app, order.id, id, "failed"),
          "Ese reembolso ya fue resuelto.",
        );
      });
    });

    it("un fallido libera el tope; el pago sigue igual", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        const before = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
        const created = await record(app, order.id, refund({ amount: 30_000 }));
        const id = (created.body as { refund: { id: string } }).refund.id;
        expect(issues(await record(app, order.id, refund({ amount: 1 })))).toEqual({
          amount: "El pedido ya tiene registrado todo lo cobrado.",
        });

        const failed = await resolve(app, order.id, id, "failed");
        expect(failed.body).toMatchObject({
          refund: { status: "failed", statusLabel: "Fallido" },
          refundTotals: { committed: 0, refundable: 30_000, state: "failed" },
        });
        expect((await record(app, order.id, refund({ amount: 30_000 }))).status).toBe(201);
        expect(await db.payment.findFirstOrThrow({ where: { orderId: order.id } })).toEqual(before);
      });
    });

    it("404 si el reembolso no existe o es de otro pedido; 422 con un id inválido", async () => {
      await run(async (db, app) => {
        const order = await paidOrder(db);
        const other = await paidOrder(db);
        const created = await record(app, other.id, refund());
        const id = (created.body as { refund: { id: string } }).refund.id;

        for (const refundId of [randomUUID(), id]) {
          const res = await resolve(app, order.id, refundId, "processed");
          expect(res.status).toBe(404);
          expect(res.body).toMatchObject({ message: "El reembolso ya no existe." });
        }
        expect(issues(await resolve(app, order.id, "no-es-uuid", "processed"))).toEqual({
          refundId: "El reembolso ya no existe.",
        });
        expect(issues(await resolve(app, order.id, id, "requested"))).toEqual({
          status: "Elige Procesado o Fallido.",
        });
      });
    });
  });

  describe("concurrencia (conexiones reales)", () => {
    it("dos registros simultáneos que juntos superan lo cobrado: solo uno entra", async () => {
      const app = buildTestApp({ prisma });
      const order = await paidOrder(prisma);
      committed.push(order.id);
      const results = await Promise.all([
        record(app, order.id, refund({ amount: 20_000 })),
        record(app, order.id, refund({ amount: 20_000 })),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      const rows = await prisma.refundRecord.findMany({ where: { orderId: order.id } });
      expect(rows.map((r) => r.amount)).toEqual([20_000]);
    });
  });
});
