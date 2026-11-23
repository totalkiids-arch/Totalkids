import { createHash } from "node:crypto";

import type { Prisma } from "../generated/prisma/client.js";

import { cartTotals as computeTotals, DEFAULT_LEAD_TIME } from "../domain/cart.js";
import { formatOrderNumber } from "../domain/checkout.js";
import { quoteShipping } from "../domain/shipping.js";
import { chileDay } from "../lib/chile-time.js";
import { errors } from "../lib/errors.js";
import { issueOrderAccess } from "../lib/order-access.js";
import type { PrismaClient } from "../lib/prisma.js";
import { findCart, loadVariants, lockCart, type Db } from "./cart-store.js";
import { viewCart } from "./cart.js";
import { reserveCouponUse } from "./coupon-usage.js";

/**
 * Creación del pedido de invitado (LN-09, RF-09 a RF-14, RN-01 a RN-04).
 *
 * En una sola transacción, con el carrito bloqueado:
 *   1. revalida el carrito (precios de hoy, cupón y despacho) — si algo cambió
 *      respecto de lo que vio el comprador, 409 y no se crea nada (RN-02);
 *   2. crea el pedido con una foto de comprador, entrega, factura e importes;
 *   3. reserva atómicamente las unidades terminadas (RN-03, RN-04); lo que
 *      falta se fabrica a pedido y queda marcado con su plazo (UI-11);
 *   4. reserva el uso del cupón (sin superar el máximo con compras simultáneas);
 *   5. registra el historial de estados y encola el correo "pedido recibido".
 *
 * Idempotente (RF-13): la misma Idempotency-Key con el mismo cuerpo devuelve el
 * mismo resultado; con otro cuerpo, 409. Nunca se crean dos pedidos por reintentar.
 */

export const IDEMPOTENCY_SCOPE = "POST /orders";
/** Las claves idempotentes se recuerdan 24 horas. */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** Versión del texto de condiciones aceptado (RNF-13). Provisional hasta CL-02. */
export const TERMS_VERSION = "v1-provisional";
/** Minutos para pagar si la configuración no existe todavía. */
const DEFAULT_RESERVATION_MINUTES = 30;
/** Texto de retiro mientras el cliente no lo configura en el panel. */
const DEFAULT_PICKUP = "Taller Total Kids (dirección y horario por confirmar)";

const SYSTEM = "Sistema";
const BUYER = "Comprador";

// ─── Entrada ────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  buyer: { name: string; rut: string; email: string; phone: string };
  delivery:
    | { method: "retiro" }
    | {
        method: "despacho";
        region: string;
        commune: string;
        street: string;
        unit: string | null;
        notes: string | null;
      };
  billing:
    | { document: "boleta" }
    | {
        document: "factura";
        rut: string;
        businessName: string;
        activity: string;
        email: string;
        address: string;
        commune: string;
        purchaseOrder: boolean;
      };
}

// ─── Respuesta ──────────────────────────────────────────────────────────────

export interface OrderItemDto {
  sku: string;
  productName: string;
  optionLabel: string | null;
  quantity: number;
  unitPrice: number;
  extrasUnitPrice: number;
  lineTotal: number;
  madeToOrder: boolean;
  leadTime: string | null;
  extras: { code: string; name: string; unitPrice: number | null; text: string | null }[];
}

export interface CreatedOrderDto {
  orderNumber: string;
  status: "pending_payment";
  /** Plazo para pagar (la reserva vence ahí, RN-04). */
  paymentDueAt: string;
  totals: { subtotal: number; discount: number; shipping: number | null; total: number };
  delivery: { method: "retiro" | "despacho"; leadTime: string | null };
  items: OrderItemDto[];
  /** Credencial del pedido para X-Order-Access (ver lib/order-access.ts). */
  accessToken: string;
}

/** Huella de la petición para la idempotencia (cuerpo ya normalizado). */
export function requestFingerprint(input: CreateOrderInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

const conflict = (message: string, reason: string) => errors.conflict(message, { reason });

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

// ─── Idempotencia ───────────────────────────────────────────────────────────

type StoredResponse = Omit<CreatedOrderDto, "accessToken"> & { orderId: string };

/** Respuesta guardada para una clave, o error si la clave se usó con otro cuerpo. */
async function replay(
  db: Db,
  key: string,
  hash: string,
  secret: string,
  now: Date,
): Promise<CreatedOrderDto | null> {
  const record = await db.idempotencyRecord.findUnique({
    where: { scope_key: { scope: IDEMPOTENCY_SCOPE, key } },
  });
  if (!record || record.expiresAt <= now) return null;
  if (record.requestHash !== hash) {
    throw conflict(
      "Esta clave de compra ya se usó con otros datos. Recarga la página para comprar de nuevo.",
      "idempotency_mismatch",
    );
  }
  if (record.status !== "completed" || !record.responseBody) {
    throw conflict("Tu compra se está procesando. Espera un momento.", "in_progress");
  }
  const { orderId, ...body } = record.responseBody as unknown as StoredResponse;
  // La credencial no se guarda: se vuelve a derivar.
  return { ...body, accessToken: issueOrderAccess(secret, orderId) };
}

// ─── Reserva de stock (RN-03, RN-04) ────────────────────────────────────────

/**
 * Reserva hasta `quantity` unidades terminadas de la variante, en un solo
 * UPDATE con la fila bloqueada: nunca deja el reservado sobre el físico.
 * Devuelve cuántas reservó y cómo quedó el stock.
 */
async function reserveStock(db: Db, variantId: string, quantity: number) {
  const rows = await db.$queryRaw<{ taken: number; physical: number; reserved: number }[]>`
    WITH v AS (
      SELECT "id", LEAST(${quantity}::int, "stock_physical" - "stock_reserved") AS "taken"
        FROM "product_variants"
       WHERE "id" = ${variantId}::uuid
       FOR UPDATE
    )
    UPDATE "product_variants" p
       SET "stock_reserved" = p."stock_reserved" + v."taken", "updated_at" = now()
      FROM v
     WHERE p."id" = v."id" AND v."taken" > 0
    RETURNING v."taken"::int AS "taken", p."stock_physical" AS "physical", p."stock_reserved" AS "reserved"`;
  return rows[0] ?? { taken: 0, physical: 0, reserved: 0 };
}

// ─── Crear ──────────────────────────────────────────────────────────────────

export interface CreateOrderOptions {
  cartToken: string | undefined;
  idempotencyKey: string;
  input: CreateOrderInput;
  /** Secreto para derivar la credencial X-Order-Access. */
  accessSecret: string;
  now?: Date;
}

export async function createOrder(
  prisma: PrismaClient,
  options: CreateOrderOptions,
): Promise<{ status: 200 | 201; order: CreatedOrderDto }> {
  const now = options.now ?? new Date();
  // Sin carrito no hay compra (un reintento legítimo trae la cookie: el carrito
  // se conserva hasta que el pago se confirma).
  if (!options.cartToken) throw conflict("Tu carrito está vacío.", "empty_cart");
  const hash = requestFingerprint(options.input);
  const previous = await replay(prisma, options.idempotencyKey, hash, options.accessSecret, now);
  if (previous) return { status: 200, order: previous };

  try {
    const order = await prisma.$transaction(
      (tx) => createInTransaction(tx, { ...options, now, hash }),
      { timeout: 15_000 },
    );
    return { status: 201, order };
  } catch (error) {
    // Otra petición con la misma clave ganó la carrera: se responde lo de ella.
    if (isUniqueViolation(error)) {
      const raced = await replay(prisma, options.idempotencyKey, hash, options.accessSecret, now);
      if (raced) return { status: 200, order: raced };
    }
    throw error;
  }
}

async function createInTransaction(
  tx: Db,
  options: CreateOrderOptions & { now: Date; hash: string },
): Promise<CreatedOrderDto> {
  const { input, now } = options;
  const token = options.cartToken ?? "";

  // La clave queda tomada desde el inicio: una petición paralela choca con el índice único.
  await tx.idempotencyRecord.create({
    data: {
      scope: IDEMPOTENCY_SCOPE,
      key: options.idempotencyKey,
      requestHash: options.hash,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    },
  });

  // 1. Carrito revalidado, con la fila bloqueada.
  const stored = await findCart(tx, token, now);
  if (!stored) throw conflict("Tu carrito está vacío.", "empty_cart");
  await lockCart(tx, stored.id);
  const cart = (await findCart(tx, token, now)) ?? stored;
  const view = await viewCart(tx, cart, now);
  if (view.lines.length === 0) throw conflict("Tu carrito está vacío.", "empty_cart");
  if (view.blocked) {
    throw conflict("Hay productos que ya no se pueden comprar. Revisa tu carrito.", "cart_blocked");
  }
  if (view.changed) {
    throw conflict(
      "Actualizamos tu carrito con la disponibilidad de hoy. Revísalo antes de pagar.",
      "cart_changed",
    );
  }
  if (view.coupon && !view.coupon.valid) {
    throw conflict(
      view.coupon.message ?? "El cupón ya no es válido. Quítalo para continuar.",
      "coupon_invalid",
    );
  }

  // 2. Entrega y totales (RN-01). El despacho por confirmar no suma.
  const settings = await tx.setting.findUnique({ where: { id: 1 } });
  const delivery = input.delivery;
  let shippingCost: number | null = 0;
  let deliveryLeadTime: string | null = null;
  let zoneId: string | null = null;
  if (delivery.method === "retiro") {
    if (settings && !settings.pickupEnabled) {
      throw conflict("El retiro en taller no está disponible por ahora.", "pickup_disabled");
    }
  } else {
    const zone = await tx.shippingZone.findFirst({
      where: {
        region: delivery.region,
        commune: { equals: delivery.commune, mode: "insensitive" },
      },
    });
    const quote = quoteShipping(
      "despacho",
      view.totals.subtotal - view.totals.discount,
      zone,
      settings?.freeShippingThreshold ?? null,
    );
    shippingCost = quote.cost;
    deliveryLeadTime = quote.leadTime;
    zoneId = zone?.active ? zone.id : null;
  }
  const totals = computeTotals(view.totals.subtotal, view.totals.discount, shippingCost);
  const minutes = settings?.reservationMinutes ?? DEFAULT_RESERVATION_MINUTES;
  const paymentDueAt = new Date(now.getTime() + minutes * 60_000);
  const couponId = view.coupon?.valid ? cart.couponId : null;

  // 3. Pedido con la foto de comprador, entrega, factura e importes (RN-02).
  const billing = input.billing;
  const order = await tx.order.create({
    data: {
      idempotencyKey: options.idempotencyKey,
      buyerName: input.buyer.name,
      buyerRut: input.buyer.rut,
      buyerEmail: input.buyer.email,
      buyerPhone: input.buyer.phone,
      deliveryMethod: delivery.method === "retiro" ? "pickup" : "shipping",
      pickupDetails:
        delivery.method === "retiro" ? (settings?.pickupDetails ?? DEFAULT_PICKUP) : null,
      shippingZoneId: zoneId,
      shippingRegion: delivery.method === "despacho" ? delivery.region : null,
      shippingCommune: delivery.method === "despacho" ? delivery.commune : null,
      shippingStreet: delivery.method === "despacho" ? delivery.street : null,
      shippingUnit: delivery.method === "despacho" ? delivery.unit : null,
      shippingNotes: delivery.method === "despacho" ? delivery.notes : null,
      shippingLeadTime: deliveryLeadTime,
      taxDocument: billing.document,
      ...(billing.document === "factura"
        ? {
            invoiceRut: billing.rut,
            invoiceBusinessName: billing.businessName,
            invoiceActivity: billing.activity,
            invoiceEmail: billing.email,
            invoiceAddress: billing.address,
            invoiceCommune: billing.commune,
            purchaseOrderRequired: billing.purchaseOrder,
          }
        : {}),
      subtotal: totals.subtotal,
      discount: totals.discount,
      shippingCost: totals.shipping,
      total: totals.total,
      couponId,
      couponCode: couponId ? (view.coupon?.code ?? null) : null,
      termsAcceptedAt: now,
      termsVersion: TERMS_VERSION,
      paymentDueAt,
      createdAt: now,
    },
  });
  const orderNumber = formatOrderNumber(order.number);

  // 4. Reserva de unidades terminadas por variante; el resto, a pedido.
  const catalog = await loadVariants(
    tx,
    cart.lines.map((l) => l.variantId),
    now,
  );
  const wanted = new Map<string, number>();
  for (const line of cart.lines) {
    wanted.set(line.variantId, (wanted.get(line.variantId) ?? 0) + line.quantity);
  }
  const reservedLeft = new Map<string, number>();
  for (const [variantId, quantity] of wanted) {
    const result = await reserveStock(tx, variantId, quantity);
    reservedLeft.set(variantId, result.taken);
    if (result.taken === 0) continue;
    await tx.stockReservation.create({
      data: { orderId: order.id, variantId, quantity: result.taken, expiresAt: paymentDueAt },
    });
    await tx.inventoryMovement.create({
      data: {
        variantId,
        kind: "reservation",
        reservedDelta: result.taken,
        physicalAfter: result.physical,
        reservedAfter: result.reserved,
        reason: `Reserva del pedido ${orderNumber}`,
        orderId: order.id,
        actorLabel: SYSTEM,
      },
    });
  }

  // 5. Líneas con su foto de precios (RN-02); las reservadas se asignan en orden.
  const items: OrderItemDto[] = [];
  const priced = new Map(view.lines.map((line) => [line.id, line]));
  for (const line of cart.lines) {
    const pricedLine = priced.get(line.id);
    if (!pricedLine || pricedLine.unitPrice === null || pricedLine.lineTotal === null) continue;
    const left = reservedLeft.get(line.variantId) ?? 0;
    const covered = Math.min(left, line.quantity);
    reservedLeft.set(line.variantId, left - covered);
    const madeToOrder = covered < line.quantity;
    const leadTime = madeToOrder
      ? (catalog.get(line.variantId)?.leadTime ?? DEFAULT_LEAD_TIME)
      : null;
    await tx.orderItem.create({
      data: {
        orderId: order.id,
        variantId: line.variantId,
        productName: pricedLine.productName,
        sku: pricedLine.sku,
        optionLabel: pricedLine.optionLabel,
        quantity: line.quantity,
        unitPrice: pricedLine.unitPrice,
        extrasUnitPrice: pricedLine.extrasUnitPrice,
        lineTotal: pricedLine.lineTotal,
        madeToOrder,
        leadTime,
        extras: {
          create: pricedLine.extras.map((e) => ({
            extraCode: e.code,
            extraName: e.name,
            unitPrice: e.unitPrice,
            text: e.text,
          })),
        },
      },
    });
    items.push({
      sku: pricedLine.sku,
      productName: pricedLine.productName,
      optionLabel: pricedLine.optionLabel,
      quantity: line.quantity,
      unitPrice: pricedLine.unitPrice,
      extrasUnitPrice: pricedLine.extrasUnitPrice,
      lineTotal: pricedLine.lineTotal,
      madeToOrder,
      leadTime,
      extras: pricedLine.extras,
    });
  }

  // 6. Uso del cupón: atómico; si otra compra se llevó el último, no se crea nada.
  if (couponId) {
    const reserved = await reserveCouponUse(tx, {
      couponId,
      orderId: order.id,
      discount: totals.discount,
      today: chileDay(now),
    });
    if (!reserved.ok) {
      throw conflict(
        "El cupón alcanzó su máximo de usos. Quítalo para continuar.",
        "coupon_exhausted",
      );
    }
  }

  // 7. Historial y correo "pedido recibido" (lo envía el worker, LN-14).
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "pending_payment", actorLabel: BUYER, createdAt: now },
  });
  await tx.outboxJob.create({
    data: {
      type: "email.order_received",
      eventKey: `email.order_received:${order.id}`,
      payload: { orderId: order.id, orderNumber },
    },
  });

  const body: Omit<CreatedOrderDto, "accessToken"> = {
    orderNumber,
    status: "pending_payment",
    paymentDueAt: paymentDueAt.toISOString(),
    totals,
    delivery: { method: delivery.method, leadTime: deliveryLeadTime },
    items,
  };
  await tx.idempotencyRecord.update({
    where: { scope_key: { scope: IDEMPOTENCY_SCOPE, key: options.idempotencyKey } },
    data: {
      status: "completed",
      responseStatus: 201,
      responseBody: {
        ...body,
        orderId: order.id,
      } satisfies StoredResponse as unknown as Prisma.InputJsonObject,
    },
  });
  return { ...body, accessToken: issueOrderAccess(options.accessSecret, order.id) };
}
