import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PaymentStatus } from "../src/generated/prisma/enums.js";
import { createLogger } from "../src/lib/logger.js";
import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import {
  FlowRejectedError,
  FlowUncertainError,
  type FlowStatus,
} from "../src/services/flow/client.js";
import { reconcilePayment, runReconciliation } from "../src/services/flow/reconcile.js";
import { seal } from "../src/services/flow/seal.js";
import { buildTestApp } from "./helpers.js";
import { createOrder, createVariant } from "./order-fixtures.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Conciliación y vencimientos (LN-15) contra totalkids_test, en transacciones que
// se deshacen. Flow es falso. Se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
const SECRET = "clave";
const MINUTE = 60_000;
const adminEmail = "equipo@example.com";

describe.skipIf(!url)("conciliación con Flow (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  let operator = "";

  beforeAll(async () => {
    operator = (await panelSession(prisma, "operator")).token;
  });
  afterAll(() => prisma.$disconnect());

  /** Pedido de 2 unidades reservadas; el plazo de pago termina 1 h después de crearlo. */
  async function prepare(
    db: PrismaClient,
    options: { ageMinutes: number; payment?: PaymentStatus; withToken?: boolean },
  ) {
    const createdAt = new Date(Date.now() - options.ageMinutes * MINUTE);
    const variant = await createVariant(db, 5, 2);
    const order = await createOrder(db, {
      createdAt,
      lines: [{ variantId: variant.id, quantity: 2, reservation: "active" }],
      payments: options.payment ? [options.payment] : [],
    });
    const token = `TOKEN-${randomUUID()}`;
    const payment = await db.payment.findFirst({ where: { orderId: order.id } });
    if (payment && options.withToken !== false) {
      const target = `https://sandbox.flow.cl/app/web/pay.php?token=${token}`;
      await db.payment.update({
        where: { id: payment.id },
        data: { tokenHash: hashToken(token), redirectUrlEncrypted: seal(target, SECRET) },
      });
    }
    const getStatus = vi.fn();
    const getStatusByCommerceOrder = vi.fn();
    const flow = {
      client: { createPayment: vi.fn(), getStatus, getStatusByCommerceOrder },
      callbackBase: "https://api.test/api/v1",
      sealSecret: SECRET,
    };
    const reply = (status: FlowStatus, change: { amount?: number } = {}) => {
      const answer = {
        flowOrder: 1,
        commerceOrder: payment?.commerceOrder ?? "",
        status,
        amount: order.total,
        currency: "CLP",
        media: null,
        ...change,
      };
      getStatus.mockResolvedValue(answer);
      getStatusByCommerceOrder.mockResolvedValue(answer);
    };
    const fail = (error: Error) => {
      getStatus.mockRejectedValue(error);
      getStatusByCommerceOrder.mockRejectedValue(error);
    };
    const reconcile = () => reconcilePayment(db, flow, payment?.id ?? "", { adminEmail });
    const state = async () => ({
      order: (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
      payment: (await db.payment.findFirst({ where: { orderId: order.id } }))?.status ?? null,
      reservation: (await db.stockReservation.findFirstOrThrow({ where: { orderId: order.id } }))
        .status,
      stock: await db.productVariant
        .findUniqueOrThrow({ where: { id: variant.id } })
        .then((v) => [v.stockPhysical, v.stockReserved]),
      emails: (await db.emailLog.findMany({ where: { orderId: order.id } }))
        .map((e) => e.event)
        .sort(),
    });
    const sweep = (withFlow = true) =>
      runReconciliation(db, withFlow ? flow : null, {
        adminEmail,
        orderId: order.id,
        logger: createLogger("silent", false),
      });
    return {
      db,
      order,
      payment,
      flow,
      token,
      getStatus,
      getStatusByCommerceOrder,
      reply,
      fail,
      reconcile,
      state,
      sweep,
    };
  }

  type Ctx = Awaited<ReturnType<typeof prepare>>;
  const run = (options: Parameters<typeof prepare>[1], fn: (ctx: Ctx) => Promise<void>) =>
    inRollback(prisma, async (db) => fn(await prepare(db, options)));

  it("recupera un callback perdido consultando por token", async () => {
    await run({ ageMinutes: 10, payment: "pending" }, async (ctx) => {
      ctx.reply("paid");
      expect(await ctx.reconcile()).toBe("confirmed");
      expect(ctx.getStatus).toHaveBeenCalledWith(ctx.token);
      expect(ctx.getStatusByCommerceOrder).not.toHaveBeenCalled();
      expect(await ctx.state()).toMatchObject({
        order: "confirmed",
        payment: "paid",
        reservation: "consumed",
        stock: [3, 0],
      });
    });
  });

  it("creación incierta: consulta por número de orden", async () => {
    await run({ ageMinutes: 10, payment: "in_review", withToken: false }, async (ctx) => {
      ctx.reply("paid");
      expect(await ctx.reconcile()).toBe("confirmed");
      expect(ctx.getStatusByCommerceOrder).toHaveBeenCalledTimes(1);
    });
  });

  it("Flow no responde: antes del plazo no cambia; después, en revisión con un solo aviso", async () => {
    await run({ ageMinutes: 10, payment: "pending" }, async (ctx) => {
      ctx.fail(new FlowUncertainError("network"));
      expect(await ctx.reconcile()).toBe("uncertain");
      expect(await ctx.state()).toMatchObject({ payment: "pending", emails: [] });
    });
    await run({ ageMinutes: 120, payment: "pending" }, async (ctx) => {
      ctx.fail(new FlowUncertainError("network"));
      await ctx.reconcile();
      await ctx.reconcile();
      expect(await ctx.state()).toEqual({
        order: "pending_payment",
        payment: "in_review",
        reservation: "in_review",
        stock: [5, 2],
        emails: ["payment_review"],
      });
      // Cuando Flow vuelve a responder, se resuelve solo.
      ctx.reply("rejected");
      expect(await ctx.reconcile()).toBe("rejected");
      await ctx.sweep();
      expect(await ctx.state()).toMatchObject({ order: "expired", stock: [5, 0] });
    });
  });

  it("pendiente en Flow: vence solo después del margen y admite un pago tardío", async () => {
    await run({ ageMinutes: 62, payment: "pending" }, async (ctx) => {
      ctx.reply("pending");
      expect(await ctx.reconcile()).toBe("unchanged");
      expect(await ctx.state()).toMatchObject({ order: "pending_payment", stock: [5, 2] });
    });
    await run({ ageMinutes: 70, payment: "pending" }, async (ctx) => {
      ctx.reply("pending");
      expect(await ctx.reconcile()).toBe("expired");
      expect(await ctx.state()).toMatchObject({
        order: "expired",
        payment: "expired",
        reservation: "released",
        stock: [5, 0],
      });
      ctx.reply("paid");
      expect(await ctx.reconcile()).toBe("confirmed");
      expect(await ctx.state()).toMatchObject({ order: "confirmed", stock: [3, 0] });
    });
  });

  it("intento que Flow no conoce: se anula solo sin token, vencido y con 400 o 404", async () => {
    const options = { ageMinutes: 70, payment: "in_review" as const };
    await run({ ...options, withToken: false }, async (ctx) => {
      ctx.fail(new FlowRejectedError(400, 105));
      expect(await ctx.reconcile()).toBe("not_found");
      await ctx.sweep();
      expect(await ctx.state()).toMatchObject({ order: "expired", payment: "voided" });
    });
    await run({ ...options, withToken: false }, async (ctx) => {
      ctx.fail(new FlowRejectedError(401, null));
      expect(await ctx.reconcile()).toBe("uncertain");
    });
    await run(options, async (ctx) => {
      ctx.fail(new FlowRejectedError(400, 105));
      expect(await ctx.reconcile()).toBe("uncertain");
    });
  });

  it("una diferencia de monto no confirma ni vence", async () => {
    await run({ ageMinutes: 70, payment: "pending" }, async (ctx) => {
      ctx.reply("paid", { amount: 1 });
      expect(await ctx.reconcile()).toBe("mismatch");
      expect(await ctx.state()).toMatchObject({ order: "in_review", payment: "in_review" });
    });
  });

  it("vence un pedido sin cobro abierto y devuelve el cupón; no toca uno con cobro abierto", async () => {
    await run({ ageMinutes: 61 }, async (ctx) => {
      const coupon = await ctx.db.coupon.create({
        data: {
          code: `LN15${randomUUID().slice(0, 6)}`.toUpperCase(),
          kind: "amount",
          value: 1000,
          startsOn: new Date("2026-01-01"),
          endsOn: new Date("2099-12-31"),
          maxUses: 10,
          usesCount: 1,
        },
      });
      await ctx.db.couponRedemption.create({
        data: { couponId: coupon.id, orderId: ctx.order.id, discount: 0 },
      });
      await ctx.sweep(false);
      expect(await ctx.state()).toMatchObject({ order: "expired", stock: [5, 0] });
      const saved = await ctx.db.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(saved.usesCount).toBe(0);
    });
    await run({ ageMinutes: 61, payment: "pending" }, async (ctx) => {
      await ctx.sweep(false);
      expect(await ctx.state()).toMatchObject({ order: "pending_payment", stock: [5, 2] });
    });
    await run({ ageMinutes: 10 }, async (ctx) => {
      await ctx.sweep(false);
      expect((await ctx.state()).order).toBe("pending_payment");
    });
  });

  it("panel: concilia con motivo y auditoría; un pago cerrado responde 409", async () => {
    await run({ ageMinutes: 10, payment: "pending" }, async (ctx) => {
      ctx.reply("paid");
      const app = buildTestApp({ prisma: ctx.db, flow: ctx.flow });
      const post = (body: object) =>
        request(app)
          .post(`/api/v1/admin/payments/${ctx.payment?.id ?? ""}/reconcile`)
          .set(panelHeaders(operator))
          .send(body);
      expect((await post({})).status).toBe(422);
      const res = await post({ reason: "El comprador avisó que pagó" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ outcome: "confirmed" });
      const audit = await ctx.db.auditLog.findFirstOrThrow({
        where: { resourceId: ctx.order.id, action: "payment.reconciled" },
      });
      expect(audit).toMatchObject({
        reason: "El comprador avisó que pagó",
        actorLabel: "Operador",
      });
      expect((await post({ reason: "Otra vez" })).status).toBe(409);
    });
  });
});
