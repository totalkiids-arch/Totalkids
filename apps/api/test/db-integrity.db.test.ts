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
   * `constraint` (nombre del CHECK, índice o mensaje del trigger). Con una
   * lista, basta con que falle por cualquiera: sirve cuando un dato viola
   * varias reglas a la vez y Postgres informa solo la primera que evalúa.
   */
  async function expectViolation(
    constraint: string | string[],
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
    const expected = Array.isArray(constraint) ? constraint : [constraint];
    const label = expected.map((name) => `«${name}»`).join(" o ");
    expect(caught, `se esperaba que ${label} rechazara la operación`).not.toBeInstanceOf(Rollback);
    expect(caught).not.toBeNull();
    const text = errorText(caught);
    expect(
      expected.some((name) => text.includes(name)),
      `se esperaba ${label}, llegó: ${text}`,
    ).toBe(true);
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

  const STAFF = { passwordHash: "x", role: "operator" as const };

  it("users: el correo se guarda en minúsculas y es único", async () => {
    await expectViolation("users_email_lowercase", (tx) =>
      tx.user.create({ data: { ...STAFF, email: "Ana@Correo.cl", name: "Ana" } }),
    );
    await expectViolation(
      "email",
      (tx) => tx.user.create({ data: { ...STAFF, email: "ana@correo.cl", name: "Otra" } }),
      async (tx) => {
        await tx.user.create({ data: { ...STAFF, email: "ana@correo.cl", name: "Ana" } });
      },
    );
  });

  it("users: solo roles del equipo y siempre explícitos (UI-09)", async () => {
    // Sin rol: Prisma lo rechaza antes de llegar a la base.
    await expectViolation("role", (tx) =>
      tx.user.create({
        data: { email: "sinrol@correo.cl", passwordHash: "x", name: "Sin rol" },
      } as unknown as Prisma.UserCreateArgs),
    );
    // Sin default en la base: un INSERT directo sin rol también falla.
    await expectViolation(
      "role",
      (tx) =>
        tx.$executeRaw`INSERT INTO "users" ("id", "email", "password_hash", "name", "updated_at")
          VALUES (gen_random_uuid(), 'raw@correo.cl', 'x', 'Raw', now())`,
    );
    await expectViolation(
      "user_role",
      (tx) =>
        tx.$executeRaw`INSERT INTO "users" ("id", "email", "password_hash", "name", "role", "updated_at")
          VALUES (gen_random_uuid(), 'cliente@correo.cl', 'x', 'Cliente', 'customer', now())`,
    );
  });

  // ── Carrito (UI-09) ────────────────────────────────────────────────────────

  it("carts: siempre de un invitado (cookie opaca)", async () => {
    await expectViolation(
      "guest_token_hash",
      (tx) =>
        tx.$executeRaw`INSERT INTO "carts" ("id", "expires_at", "updated_at")
          VALUES (gen_random_uuid(), now() + interval '1 day', now())`,
    );
  });

  // ── Catálogo e inventario (RN-01, RN-03) ───────────────────────────────────

  it("product_variants: stock nunca negativo y reservado ≤ físico", async () => {
    // Un físico negativo siempre viola también reservado ≤ físico (reservado ≥ 0).
    await expectViolation(
      ["product_variants_stock_physical_non_negative", "product_variants_reserved_within_physical"],
      (tx) => variant(tx, { stockPhysical: -1 }),
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

  // ── Despacho a coordinar (UI-13) ───────────────────────────────────────────

  const SHIPPING = {
    deliveryMethod: "shipping" as const,
    pickupDetails: null,
    shippingRegion: "AR",
    shippingCommune: "Temuco",
    shippingStreet: "Av. Alemania 0123",
  };

  it("orders: despacho por confirmar no suma al total; el retiro siempre cuesta 0", async () => {
    await inRollback(async (tx) => {
      const order = await tx.order.create({ data: orderData({ ...SHIPPING, shippingCost: null }) });
      expect(order.shippingCost).toBeNull();
      expect(order.total).toBe(20_000);
    });
    await expectViolation("orders_total_formula", (tx) =>
      tx.order.create({ data: orderData({ ...SHIPPING, shippingCost: 5_000 }) }),
    );
    await expectViolation("orders_pickup_details", (tx) =>
      tx.order.create({ data: orderData({ shippingCost: null }) }),
    );
  });

  it("shipping_zones: la tarifa puede quedar por confirmar, pero nunca negativa", async () => {
    await inRollback(async (tx) => {
      const zone = await tx.shippingZone.create({
        data: { region: "AR", commune: "Temuco", price: null, leadTime: "A coordinar" },
      });
      expect(zone.price).toBeNull();
    });
    await expectViolation("shipping_zones_price_non_negative", (tx) =>
      tx.shippingZone.create({
        data: { region: "AR", commune: "Padre Las Casas", price: -1, leadTime: "A coordinar" },
      }),
    );
  });

  // ── Factura con folio (UI-12) ──────────────────────────────────────────────

  const INVOICE = {
    taxDocument: "factura" as const,
    invoiceRut: "76.123.456-7",
    invoiceBusinessName: "Jardín Los Peques SpA",
    invoiceActivity: "Educación parvularia",
    invoiceEmail: "pagos@lospeques.cl",
    invoiceAddress: "Av. Siempre Viva 742",
    invoiceCommune: "Temuco",
  };
  const ISSUED = {
    invoiceFolio: "4521",
    invoiceIssuedAt: new Date(),
    invoiceIssuedByLabel: "Administrador",
  };

  it("orders: folio solo en facturas pagadas, con fecha y actor, y sin repetirse", async () => {
    await expectViolation("orders_invoice_folio_rules", (tx) =>
      tx.order.create({ data: orderData({ ...ISSUED, status: "confirmed", paidAt: new Date() }) }),
    );
    await expectViolation("orders_invoice_folio_rules", (tx) =>
      tx.order.create({ data: orderData({ ...INVOICE, ...ISSUED }) }),
    );
    await expectViolation("orders_invoice_folio_rules", (tx) =>
      tx.order.create({
        data: orderData({
          ...INVOICE,
          invoiceFolio: "4521",
          status: "confirmed",
          paidAt: new Date(),
        }),
      }),
    );
    const paidInvoice = () =>
      orderData({ ...INVOICE, ...ISSUED, status: "confirmed", paidAt: new Date() });
    await expectViolation(
      "orders_invoice_folio_key",
      (tx) => tx.order.create({ data: paidInvoice() }),
      async (tx) => {
        await tx.order.create({ data: paidInvoice() });
      },
    );
  });

  // ── Productos a pedido (UI-11) ─────────────────────────────────────────────

  // Que la línea a pedido no reserve stock lo decide la aplicación (LN de
  // pedidos); aquí solo se comprueba que el modelo la admite con stock 0.
  it("order_items: una línea a pedido se acepta aunque la variante no tenga stock", async () => {
    await inRollback(async (tx) => {
      const v = await variant(tx, { stockPhysical: 0 });
      const order = await tx.order.create({ data: orderData() });
      const item = await tx.orderItem.create({
        data: {
          orderId: order.id,
          variantId: v.id,
          productName: "Cuna",
          sku: v.sku,
          quantity: 2,
          unitPrice: 10_000,
          lineTotal: 20_000,
          madeToOrder: true,
          leadTime: "15 a 20 días hábiles",
        },
      });
      expect(item.madeToOrder).toBe(true);
      expect(item.leadTime).toBe("15 a 20 días hábiles");
    });
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

  // ── Revisión de LN-01: lo que la aplicación ya usa ─────────────────────────

  it("settings: solo plantillas que existen en la tienda (UI-13)", async () => {
    await expectViolation("settings_active_theme_known", (tx) =>
      tx.setting.create({ data: { id: 1, pickupDetails: "Taller", activeTheme: "halloween" } }),
    );
    await inRollback(async (tx) => {
      const row = await tx.setting.create({ data: { id: 1, pickupDetails: "Taller" } });
      expect(row.activeTheme).toBe("clasica");
    });
  });

  it("product_extras: precio por producto no negativo y largo del texto de 1 a 200", async () => {
    const link = async (tx: Tx, data: { price?: number; textMaxLength?: number }) => {
      const v = await variant(tx);
      const extra = await tx.extra.create({ data: { code: `x-${unique()}`, name: "Armado" } });
      await tx.productExtra.create({
        data: { productId: v.productId, extraId: extra.id, ...data },
      });
    };
    await expectViolation("product_extras_price_non_negative", (tx) => link(tx, { price: -1 }));
    await expectViolation("product_extras_text_max_length_range", (tx) =>
      link(tx, { textMaxLength: 0 }),
    );
    await inRollback((tx) => link(tx, { price: 15_000, textMaxLength: 20 }));
  });

  it("product_categories: categorías adicionales sin borrar la categoría en uso", async () => {
    let categoryId = "";
    await expectViolation(
      "product_categories_category_id_fkey",
      (tx) => tx.category.delete({ where: { id: categoryId } }),
      async (tx) => {
        const v = await variant(tx);
        const junji = await tx.category.create({
          data: { name: "Línea JUNJI", slug: `junji-${unique()}` },
        });
        categoryId = junji.id;
        await tx.productCategory.create({ data: { productId: v.productId, categoryId } });
      },
    );
  });

  it("products: nombre de la opción y plazo, si vienen, no están en blanco", async () => {
    await expectViolation("products_lead_time_present", async (tx) => {
      const v = await variant(tx);
      await tx.product.update({ where: { id: v.productId }, data: { leadTime: "  " } });
    });
    await expectViolation("products_option_name_present", async (tx) => {
      const v = await variant(tx);
      await tx.product.update({ where: { id: v.productId }, data: { optionName: "" } });
    });
  });
});
