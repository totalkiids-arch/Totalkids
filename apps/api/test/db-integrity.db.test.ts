import { afterAll, describe, expect, it } from "vitest";

import type { Prisma } from "../src/generated/prisma/client.js";
import { createPrismaClient } from "../src/lib/prisma.js";

// Tests de integridad del modelo de datos (LN-01, SRS 4.5) contra totalkids_test.
// Requieren docker compose up y pnpm db:migrate:test; se omiten si
// TEST_DATABASE_URL no está definida. Cada caso corre en una transacción que se
// deshace al final: no deja datos.
const url = process.env.TEST_DATABASE_URL;

type Tx = Prisma.TransactionClient;

class Rollback extends Error {}

describe.skipIf(!url)("integridad del modelo de datos (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Corre `fn` en una transacción y la deshace siempre. */
  async function inRollback(fn: (tx: Tx) => Promise<void>) {
    await expect(
      prisma.$transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  /** Todo el texto de un error (mensaje, causa y metadatos de Prisma). */
  function errorText(error: unknown, depth = 0): string {
    if (depth > 4 || error === null || error === undefined) return "";
    if (typeof error !== "object") return String(error);
    const e = error as { message?: unknown; cause?: unknown; meta?: unknown };
    return [
      String(e.message ?? ""),
      JSON.stringify(e.meta ?? {}),
      errorText(e.cause, depth + 1),
    ].join(" ");
  }

  /**
   * Prepara datos con `setup` y espera que `act` falle por la restricción
   * `constraint` (nombre del CHECK, índice o mensaje del trigger).
   */
  async function expectViolation(
    constraint: string,
    act: (tx: Tx) => Promise<unknown>,
    setup: (tx: Tx) => Promise<void> = async () => {},
  ) {
    let caught: unknown = null;
    try {
      await prisma.$transaction(async (tx) => {
        await setup(tx);
        await act(tx);
        throw new Rollback();
      });
    } catch (error) {
      caught = error;
    }
    expect(caught, `se esperaba que «${constraint}» rechazara la operación`).not.toBeInstanceOf(
      Rollback,
    );
    expect(caught).not.toBeNull();
    expect(errorText(caught)).toContain(constraint);
  }

  // ── Datos de apoyo ─────────────────────────────────────────────────────────

  const unique = () => Math.random().toString(36).slice(2, 10);

  async function variant(tx: Tx, data: Partial<Prisma.ProductVariantUncheckedCreateInput> = {}) {
    const u = unique();
    const category = await tx.category.create({ data: { name: `Cat ${u}`, slug: `cat-${u}` } });
    const product = await tx.product.create({
      data: { categoryId: category.id, name: `Producto ${u}`, slug: `producto-${u}` },
    });
    return tx.productVariant.create({
      data: { productId: product.id, sku: `TK-T${u}`, price: 10_000, stockPhysical: 5, ...data },
    });
  }

  const BUYER = {
    buyerName: "María González",
    buyerRut: "12.345.678-5",
    buyerEmail: "maria@correo.cl",
    buyerPhone: "+56912345678",
  };

  /** Datos mínimos válidos de un pedido con retiro y boleta (total 20.000). */
  function orderData(overrides: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
    return {
      idempotencyKey: `k-${unique()}`,
      ...BUYER,
      deliveryMethod: "pickup" as const,
      pickupDetails: "Tienda Total Kids",
      taxDocument: "boleta" as const,
      subtotal: 20_000,
      shippingCost: 0,
      total: 20_000,
      termsAcceptedAt: new Date(),
      termsVersion: "v1",
      paymentDueAt: new Date(Date.now() + 30 * 60_000),
      ...overrides,
    } satisfies Prisma.OrderUncheckedCreateInput;
  }

  async function paidPayment(tx: Tx, amount = 20_000) {
    const order = await tx.order.create({ data: orderData({ subtotal: amount, total: amount }) });
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        attempt: 1,
        commerceOrder: `CO-${unique()}`,
        amount,
        status: "paid",
        paidAt: new Date(),
      },
    });
    return { order, payment };
  }

  // ── Cuentas ────────────────────────────────────────────────────────────────

  it("users: el correo se guarda en minúsculas y es único", async () => {
    await expectViolation("users_email_lowercase", (tx) =>
      tx.user.create({ data: { email: "Ana@Correo.cl", passwordHash: "x", name: "Ana" } }),
    );
    await expectViolation(
      "email",
      (tx) => tx.user.create({ data: { email: "ana@correo.cl", passwordHash: "x", name: "Otra" } }),
      async (tx) => {
        await tx.user.create({ data: { email: "ana@correo.cl", passwordHash: "x", name: "Ana" } });
      },
    );
  });

  // ── Catálogo e inventario (RN-01, RN-03) ───────────────────────────────────

  it("product_variants: stock nunca negativo y reservado ≤ físico", async () => {
    await expectViolation("product_variants_stock_physical_non_negative", (tx) =>
      variant(tx, { stockPhysical: -1 }),
    );
    await expectViolation("product_variants_reserved_within_physical", (tx) =>
      variant(tx, { stockPhysical: 2, stockReserved: 3 }),
    );
    await inRollback(async (tx) => {
      const v = await variant(tx, { stockPhysical: 2, stockReserved: 2 });
      expect(v.stockReserved).toBe(2);
    });
  });

  it("product_variants: precio no negativo y precio anterior mayor al actual", async () => {
    await expectViolation("product_variants_price_non_negative", (tx) =>
      variant(tx, { price: -1 }),
    );
    await expectViolation("product_variants_compare_at_above_price", (tx) =>
      variant(tx, { price: 10_000, compareAtPrice: 10_000 }),
    );
  });

  it("categorías con productos no se borran en cascada (Restrict)", async () => {
    let categoryId = "";
    await expectViolation(
      "products_category_id_fkey",
      (tx) => tx.category.delete({ where: { id: categoryId } }),
      async (tx) => {
        const v = await variant(tx);
        const product = await tx.product.findUniqueOrThrow({ where: { id: v.productId } });
        categoryId = product.categoryId;
      },
    );
  });

  it("inventory_movements: el movimiento deja un stock válido y tiene motivo", async () => {
    await expectViolation("inventory_movements_valid_result", async (tx) => {
      const v = await variant(tx);
      await tx.inventoryMovement.create({
        data: {
          variantId: v.id,
          kind: "adjustment",
          physicalDelta: -10,
          physicalAfter: -5,
          reservedAfter: 0,
          reason: "Conteo",
          actorLabel: "Administrador",
        },
      });
    });
  });

  // ── Cupones ────────────────────────────────────────────────────────────────

  it("coupons: los usos nunca superan el máximo y el valor respeta el tipo", async () => {
    const base = { startsOn: new Date("2026-11-01"), endsOn: new Date("2026-11-30"), maxUses: 2 };
    await expectViolation("coupons_uses_within_max", (tx) =>
      tx.coupon.create({
        data: { ...base, code: "CUPO", kind: "amount", value: 5000, usesCount: 3 },
      }),
    );
    await expectViolation("coupons_value_by_kind", (tx) =>
      tx.coupon.create({ data: { ...base, code: "MUCHO", kind: "percent", value: 150 } }),
    );
  });

  // ── Pedidos (RN-01, RN-02) ─────────────────────────────────────────────────

  it("orders: total = subtotal − descuento + despacho", async () => {
    await expectViolation("orders_total_formula", (tx) =>
      tx.order.create({ data: orderData({ total: 19_000 }) }),
    );
    await inRollback(async (tx) => {
      const order = await tx.order.create({ data: orderData() });
      expect(order.number).toBeGreaterThanOrEqual(1001);
    });
  });

  it("orders: despacho con dirección, factura con datos y despachado con seguimiento", async () => {
    await expectViolation("orders_shipping_address", (tx) =>
      tx.order.create({
        data: orderData({ deliveryMethod: "shipping", pickupDetails: null, shippingCost: 0 }),
      }),
    );
    await expectViolation("orders_invoice_data", (tx) =>
      tx.order.create({ data: orderData({ taxDocument: "factura" }) }),
    );
    await expectViolation("orders_shipped_has_tracking", (tx) =>
      tx.order.create({
        data: orderData({
          deliveryMethod: "shipping",
          pickupDetails: null,
          shippingRegion: "AR",
          shippingCommune: "Temuco",
          shippingStreet: "Av. Alemania 0123",
          status: "shipped",
          paidAt: new Date(),
        }),
      }),
    );
  });

  it("order_items: total de línea = (precio + extras) × cantidad", async () => {
    await expectViolation("order_items_line_total_formula", async (tx) => {
      const order = await tx.order.create({ data: orderData() });
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productName: "Cuna",
          sku: "TK-1",
          quantity: 2,
          unitPrice: 10_000,
          extrasUnitPrice: 0,
          lineTotal: 15_000,
        },
      });
    });
  });

  // ── Pagos (RF-19, RN-06) ───────────────────────────────────────────────────

  it("payments: un solo cobro confirmado y un solo intento vigente por pedido", async () => {
    await expectViolation("payments_one_paid_per_order", async (tx) => {
      const { order } = await paidPayment(tx);
      await tx.payment.create({
        data: {
          orderId: order.id,
          attempt: 2,
          commerceOrder: `CO-${unique()}`,
          amount: 20_000,
          status: "paid",
          paidAt: new Date(),
        },
      });
    });
    await expectViolation("payments_one_open_attempt_per_order", async (tx) => {
      const order = await tx.order.create({ data: orderData() });
      for (const attempt of [1, 2]) {
        await tx.payment.create({
          data: { orderId: order.id, attempt, commerceOrder: `CO-${unique()}`, amount: 20_000 },
        });
      }
    });
  });

  // ── Reembolsos (RF-32) ─────────────────────────────────────────────────────

  it("refund_records: la suma de reembolsos no supera lo cobrado", async () => {
    const refund = (orderId: string, paymentId: string, amount: number) => ({
      orderId,
      paymentId,
      amount,
      refundDate: new Date("2026-11-20"),
      reference: "Transferencia 123",
      registeredByLabel: "Administrador",
    });
    await expectViolation("superan el monto cobrado", async (tx) => {
      const { order, payment } = await paidPayment(tx, 20_000);
      await tx.refundRecord.create({ data: refund(order.id, payment.id, 15_000) });
      await tx.refundRecord.create({ data: refund(order.id, payment.id, 6_000) });
    });
    await inRollback(async (tx) => {
      const { order, payment } = await paidPayment(tx, 20_000);
      await tx.refundRecord.create({ data: refund(order.id, payment.id, 15_000) });
      // Un reembolso fallido no cuenta para el tope.
      await tx.refundRecord.create({
        data: { ...refund(order.id, payment.id, 15_000), status: "failed", resolvedAt: new Date() },
      });
      await tx.refundRecord.create({ data: refund(order.id, payment.id, 5_000) });
    });
  });

  it("refund_records: solo sobre un pago confirmado", async () => {
    await expectViolation("pago confirmado", async (tx) => {
      const order = await tx.order.create({ data: orderData() });
      const payment = await tx.payment.create({
        data: { orderId: order.id, attempt: 1, commerceOrder: `CO-${unique()}`, amount: 20_000 },
      });
      await tx.refundRecord.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          amount: 1_000,
          refundDate: new Date("2026-11-20"),
          reference: "Ref",
          registeredByLabel: "Administrador",
        },
      });
    });
  });

  it("los pedidos con pagos no se borran (historial comercial sin cascada)", async () => {
    await expectViolation("payments_order_id_fkey", async (tx) => {
      const { order } = await paidPayment(tx);
      await tx.order.delete({ where: { id: order.id } });
    });
  });

  // ── Auditoría ──────────────────────────────────────────────────────────────

  it("audit_log: solo admite inserciones", async () => {
    const entry = {
      actorLabel: "Administrador",
      action: "order.status_changed",
      resourceType: "order",
      resourceId: "TK-1001",
    };
    await expectViolation("solo admite inserciones", async (tx) => {
      const row = await tx.auditLog.create({ data: entry });
      await tx.auditLog.update({ where: { id: row.id }, data: { reason: "editado" } });
    });
    await expectViolation("solo admite inserciones", async (tx) => {
      const row = await tx.auditLog.create({ data: entry });
      await tx.auditLog.delete({ where: { id: row.id } });
    });
  });

  // ── Configuración ──────────────────────────────────────────────────────────

  it("settings: una sola fila", async () => {
    await expectViolation("settings_single_row", (tx) =>
      tx.setting.create({ data: { id: 2, pickupDetails: "Otra tienda" } }),
    );
  });
});
