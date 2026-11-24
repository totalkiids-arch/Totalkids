import { createHash } from "node:crypto";

import type { Prisma } from "../generated/prisma/client.js";

import { DEFAULT_LEAD_TIME } from "../db/seed/catalog-seed.js";
import { formatOrderNumber } from "../domain/checkout.js";
import { errors } from "../lib/errors.js";
import { issueOrderAccess } from "../lib/order-access.js";
import type { PrismaClient } from "../lib/prisma.js";
import { cleanupCart, readCart } from "./cart/cart.js";
import type { CartNotice } from "./cart/pricing.js";
import { findCart } from "./cart/session.js";
import { CouponUnavailableError, reserveCouponUse } from "./coupons.js";
import { enqueueEmail } from "./email/enqueue.js";
import { emailEventKey, type EmailDataInput } from "./email/events.js";
import type { ShippingQuoter } from "./shipping/quoter.js";

export type Db = Prisma.TransactionClient;

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
export const DEFAULT_PICKUP = "Taller Total Kids (dirección y horario por confirmar)";

const SYSTEM = "Sistema";
const BUYER = "Comprador";

// ─── Entrada ────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  /** Total que confirmó el comprador; debe coincidir con el calculado hoy (RN-02). */
  expectedTotal: number;
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

const conflict = (message: string, reason: string, extra: Record<string, unknown> = {}) =>
  errors.conflict(message, { reason, ...extra });

/**
 * 409 cuando el carrito ya no es el que vio el comprador. El motivo más grave
 * manda: un producto retirado (`cart_blocked`), luego el cupón (`coupon_invalid`)
 * y si no, un ajuste menor (`cart_changed`). Los avisos van en `details.notices`.
 */
function cartChangedConflict(notices: CartNotice[]) {
  const has = (code: CartNotice["code"]) => notices.some((n) => n.code === code);
  if (has("product_removed")) {
    return conflict(
      "Hay productos que ya no se pueden comprar. Revisa tu carrito.",
      "cart_blocked",
      { notices },
    );
  }
  if (has("coupon_removed")) {
    const message = notices.find((n) => n.code === "coupon_removed")?.message ?? "";
    return conflict(message, "coupon_invalid", { notices });
  }
  return conflict(
    "Actualizamos tu carrito con la disponibilidad de hoy. Revísalo antes de pagar.",
    "cart_changed",
    { notices },
  );
}

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
  /** Cotización de la entrega: el mismo puerto que usa GET /shipping/quote. */
  quoter: ShippingQuoter;
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

  // 1. Carrito revalidado, con la fila bloqueada (como cada escritura del carrito).
  const cart = await findCart(tx, token, now);
  if (!cart) throw conflict("Tu carrito está vacío.", "empty_cart");
  await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id}::uuid FOR UPDATE`;
  // Si la limpieza quita algo (producto retirado, extra no disponible, cupón
  // vencido), el comprador no vio lo que se cobraría: 409 y no se crea nada
  // (RN-02). La transacción se revierte; GET /cart muestra los mismos avisos.
  const notices = await cleanupCart(tx, cart.id, now);
  if (notices.length > 0) throw cartChangedConflict(notices);
  const view = await readCart(tx, cart.id, now);
  if (view.lines.length === 0) throw conflict("Tu carrito está vacío.", "empty_cart");
  if (!view.canCheckout) {
    throw conflict(
      "Hay productos con precio por confirmar. Escríbenos y lo cotizamos.",
      "cart_unpriced",
    );
  }

  // 2. Entrega y totales (RN-01). El despacho por confirmar no suma ni se cobra.
  const settings = await tx.setting.findUnique({ where: { id: 1 } });
  const delivery = input.delivery;
  const quote = await options.quoter.quote({
    method: delivery.method,
    region: delivery.method === "despacho" ? delivery.region : undefined,
    commune: delivery.method === "despacho" ? delivery.commune : undefined,
    amountAfterDiscount: view.totals.totalWithoutShipping,
  });
  if (!quote) {
    throw conflict("El retiro en taller no está disponible por ahora.", "pickup_disabled");
  }
  const deliveryLeadTime = quote.leadTime;
  const zone = quote.zone
    ? await tx.shippingZone.findUnique({
        where: { region_commune: { region: quote.zone.region, commune: quote.zone.commune } },
        select: { id: true },
      })
    : null;
  const totals = {
    subtotal: view.totals.subtotal,
    discount: view.totals.discount,
    shipping: quote.cost,
    total: view.totals.totalWithoutShipping + (quote.cost ?? 0),
  };
  if (totals.total !== input.expectedTotal) {
    throw conflict("El total de tu compra cambió. Revísalo antes de pagar.", "total_changed", {
      totals,
    });
  }
  const minutes = settings?.reservationMinutes ?? DEFAULT_RESERVATION_MINUTES;
  const paymentDueAt = new Date(now.getTime() + minutes * 60_000);
  const couponId = view.coupon?.valid ? cart.couponId : null;

  // 3. Pedido con la foto de comprador, entrega, factura e importes (RN-02).
  const billing = input.billing;
  const order = await tx.order.create({
    data: {
      idempotencyKey: options.idempotencyKey,
      cartId: cart.id,
      buyerName: input.buyer.name,
      buyerRut: input.buyer.rut,
      buyerEmail: input.buyer.email,
      buyerPhone: input.buyer.phone,
      deliveryMethod: delivery.method === "retiro" ? "pickup" : "shipping",
      pickupDetails: delivery.method === "retiro" ? (quote.pickupDetails ?? DEFAULT_PICKUP) : null,
      shippingZoneId: zone?.id ?? null,
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
  const rows = await tx.cartItem.findMany({
    where: { cartId: cart.id },
    select: { id: true, variantId: true, quantity: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const wanted = new Map<string, number>();
  for (const line of rows) {
    wanted.set(line.variantId, (wanted.get(line.variantId) ?? 0) + line.quantity);
  }
  const reservedLeft = new Map<string, number>();
  // Las variantes se bloquean en orden de id, como LN-13 (admin-orders/inventory.ts):
  // una compra y una cancelación sobre las mismas variantes nunca se cruzan (deadlock).
  // Las líneas del pedido conservan el orden del carrito.
  const byVariantId = [...wanted].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [variantId, quantity] of byVariantId) {
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
  for (const line of rows) {
    const pricedLine = priced.get(line.id);
    // canCheckout garantiza precio en todas las líneas; esto solo acota el tipo.
    if (pricedLine?.unitPrice == null || pricedLine.variantPrice === null) {
      throw conflict("Revisa tu carrito antes de pagar.", "cart_changed");
    }
    const left = reservedLeft.get(line.variantId) ?? 0;
    const covered = Math.min(left, line.quantity);
    reservedLeft.set(line.variantId, left - covered);
    const madeToOrder = covered < line.quantity;
    const leadTime = madeToOrder ? (pricedLine.availability.leadTime ?? DEFAULT_LEAD_TIME) : null;
    const unitPrice = pricedLine.variantPrice;
    const extrasUnitPrice = pricedLine.unitPrice - unitPrice;
    const lineTotal = pricedLine.unitPrice * line.quantity;
    const extras = pricedLine.extras.map((e) => ({
      code: e.code,
      name: e.name,
      unitPrice: e.price,
      text: e.text,
    }));
    await tx.orderItem.create({
      data: {
        orderId: order.id,
        variantId: line.variantId,
        productName: pricedLine.product.name,
        sku: pricedLine.sku,
        optionLabel: pricedLine.optionLabel,
        quantity: line.quantity,
        unitPrice,
        extrasUnitPrice,
        lineTotal,
        madeToOrder,
        leadTime,
        extras: {
          create: extras.map((e) => ({
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
      productName: pricedLine.product.name,
      optionLabel: pricedLine.optionLabel,
      quantity: line.quantity,
      unitPrice,
      extrasUnitPrice,
      lineTotal,
      madeToOrder,
      leadTime,
      extras,
    });
  }

  // 6. Uso del cupón: atómico; si otra compra se llevó el último, no se crea nada.
  if (couponId) {
    try {
      await reserveCouponUse(tx, { couponId, orderId: order.id, discount: totals.discount }, now);
    } catch (error) {
      if (!(error instanceof CouponUnavailableError)) throw error;
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
  await enqueueEmail(tx, {
    event: "order_received",
    recipient: order.buyerEmail,
    eventKey: emailEventKey("order_received", order.id),
    orderId: order.id,
    data: orderReceivedData(order, items, totals, paymentDueAt),
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

// ─── Correo "pedido recibido" (SRS 4.4.3, RF-20) ────────────────────────────

/** Largo máximo de cada extra en el correo (EMAIL_DATA_SCHEMAS: text(120)). */
const EMAIL_EXTRA_MAX = 120;

interface OrderSnapshot {
  number: number;
  buyerName: string;
  deliveryMethod: "pickup" | "shipping";
  pickupDetails: string | null;
  shippingStreet: string | null;
  shippingUnit: string | null;
  shippingCommune: string | null;
  shippingLeadTime: string | null;
}

/**
 * Foto del pedido para la plantilla `order_received` (ver email/events.ts):
 * líneas con extras y a pedido, importes en CLP (despacho null = a coordinar)
 * y la entrega. Nunca lleva datos de pago, RUT, teléfono ni factura.
 */
function orderReceivedData(
  order: OrderSnapshot,
  items: readonly OrderItemDto[],
  totals: { subtotal: number; discount: number; shipping: number | null; total: number },
  paymentDueAt: Date,
): EmailDataInput<"order_received"> {
  return {
    orderNumber: order.number,
    buyerName: order.buyerName,
    items: items.map((item) => ({
      name: item.productName,
      variant: item.optionLabel,
      quantity: item.quantity,
      // Unitario con extras: cantidad × unitario = total de la línea.
      unitPrice: item.unitPrice + item.extrasUnitPrice,
      lineTotal: item.lineTotal,
      extras: item.extras.map((e) =>
        (e.text ? `${e.name}: ${e.text}` : e.name).slice(0, EMAIL_EXTRA_MAX),
      ),
      madeToOrder: item.madeToOrder,
      leadTime: item.leadTime,
    })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    shippingCost: totals.shipping,
    total: totals.total,
    paymentDueAt: paymentDueAt.toISOString(),
    delivery:
      order.deliveryMethod === "pickup"
        ? {
            method: "pickup",
            pickupDetails: order.pickupDetails ?? DEFAULT_PICKUP,
            leadTime: order.shippingLeadTime,
          }
        : {
            method: "shipping",
            address: [order.shippingStreet, order.shippingUnit, order.shippingCommune]
              .filter(Boolean)
              .join(", "),
            leadTime: order.shippingLeadTime,
          },
  };
}
