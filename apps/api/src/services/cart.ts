import {
  cartTotals,
  DEFAULT_LEAD_TIME,
  priceCart,
  quantityError,
  validateAdd,
  type AddError,
  type CartTotals,
  type PricedCart,
  type PricedLine,
} from "../domain/cart.js";
import { checkCoupon, normalizeCouponCode, type CouponRow } from "../domain/coupon.js";
import { quoteShipping, type DeliveryMethod, type ShippingQuote } from "../domain/shipping.js";
import { chileDay, dateOnly } from "../lib/chile-time.js";
import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import {
  createCart,
  dropExtras,
  findCart,
  findVariantBySku,
  loadVariants,
  lockCart,
  removeLine,
  saveLine,
  setCartCoupon,
  setLineQuantity,
  touchCart,
  type CartRecord,
  type Db,
} from "./cart-store.js";

/**
 * Casos de uso del carrito de invitado (LN-06, RF-05 a RF-08). Unen las reglas
 * puras (src/domain) con el repositorio (cart-store). Precios y totales se
 * calculan siempre en el servidor (RNF-03).
 */

// ─── Respuesta ──────────────────────────────────────────────────────────────

/** Línea del carrito tal como la entrega la API (ver PricedLine en src/domain/cart.ts). */
export type CartLineDto = PricedLine;

export interface CartCouponDto {
  code: string;
  /** El cupón sigue siendo válido para este carrito hoy. */
  valid: boolean;
  /** Descuento en CLP (0 si ya no es válido). */
  discount: number;
  /** Por qué ya no aplica, si corresponde. */
  message: string | null;
}

export interface CartDto {
  lines: CartLineDto[];
  /** Unidades de las líneas que se pueden comprar. */
  units: number;
  /** Extras con precio por confirmar (no suman). */
  unpriced: string[];
  coupon: CartCouponDto | null;
  /** El despacho se cotiza aparte (GET /shipping/quote): aquí va null. */
  totals: CartTotals;
  /** Hay líneas que ya no se pueden comprar: quitarlas antes de pagar. */
  blocked: boolean;
  /** Algo cambió respecto de lo guardado (precio retirado, extra no disponible…). */
  changed: boolean;
  /** Se puede pasar al checkout: hay líneas y ninguna bloqueada. */
  checkoutReady: boolean;
}

const EMPTY_CART: CartDto = {
  lines: [],
  units: 0,
  unpriced: [],
  coupon: null,
  totals: cartTotals(0, 0, null),
  blocked: false,
  changed: false,
  checkoutReady: false,
};

type CouponModel = NonNullable<Awaited<ReturnType<Db["coupon"]["findUnique"]>>>;

/** Fila de la base → datos que evalúa el dominio (fechas como día en Chile). */
function toCouponRow(row: CouponModel | null): CouponRow | null {
  return (
    row && {
      code: row.code,
      kind: row.kind,
      value: row.value,
      startsOn: dateOnly(row.startsOn),
      endsOn: dateOnly(row.endsOn),
      maxUses: row.maxUses,
      usesCount: row.usesCount,
      active: row.active,
    }
  );
}

async function couponFor(
  db: Db,
  cart: CartRecord,
  subtotal: number,
  now: Date,
): Promise<CartCouponDto | null> {
  if (!cart.couponId) return null;
  const row = await db.coupon.findUnique({ where: { id: cart.couponId } });
  const check = checkCoupon(toCouponRow(row), subtotal, chileDay(now));
  return check.ok
    ? { code: check.code, valid: true, discount: check.discount, message: null }
    : {
        code: row?.code ?? cart.couponCode ?? "",
        valid: false,
        discount: 0,
        message: check.message,
      };
}

function toDto(priced: PricedCart, coupon: CartCouponDto | null): CartDto {
  const discount = coupon?.valid ? coupon.discount : 0;
  return {
    lines: priced.lines,
    units: priced.units,
    unpriced: priced.unpriced,
    coupon,
    totals: cartTotals(priced.subtotal, discount, null),
    blocked: priced.blocked,
    changed: priced.changed,
    checkoutReady: priced.lines.length > 0 && !priced.blocked,
  };
}

/**
 * Carrito revalidado contra el catálogo vigente (RF-06). Limpia los extras que
 * ya no se ofrecen para que no vuelvan a aparecer.
 */
export async function viewCart(
  db: Db,
  cart: CartRecord | null,
  now = new Date(),
): Promise<CartDto> {
  if (!cart || cart.lines.length === 0) {
    return cart ? { ...EMPTY_CART, coupon: await couponFor(db, cart, 0, now) } : EMPTY_CART;
  }
  const catalog = await loadVariants(
    db,
    cart.lines.map((l) => l.variantId),
    now,
  );
  const priced = priceCart(cart.lines, catalog, DEFAULT_LEAD_TIME);
  if (priced.droppedExtras.size > 0) await dropExtras(db, priced.droppedExtras);
  return toDto(priced, await couponFor(db, cart, priced.subtotal, now));
}

/** GET /cart: el carrito del token, o uno vacío (sin crearlo). */
export async function getCart(prisma: PrismaClient, token: string | undefined, now = new Date()) {
  const cart = token ? await findCart(prisma, token, now) : null;
  return viewCart(prisma, cart, now);
}

// ─── Modificaciones ─────────────────────────────────────────────────────────

function toAppError(error: AddError) {
  if (error.code === "NOT_FOUND") return errors.notFound(error.message);
  if (error.code === "CONFLICT") return errors.conflict(error.message);
  return errors.validation(error.message, {
    issues: [{ location: "body", path: error.field, message: error.message }],
  });
}

export interface AddItemInput {
  sku: string;
  quantity: number;
  extras: { code: string; text?: string | null | undefined }[];
}

/**
 * POST /cart/items: agrega una variante. Crea el carrito si no hay uno vigente
 * (`newToken` trae el token para la cookie). Todo en una transacción, con el
 * carrito bloqueado mientras se valida el máximo por SKU.
 */
export async function addItem(
  prisma: PrismaClient,
  token: string | undefined,
  input: AddItemInput,
  now = new Date(),
): Promise<{ cart: CartDto; newToken: string | null }> {
  return prisma.$transaction(async (tx) => {
    let cart = token ? await findCart(tx, token, now) : null;
    let newToken: string | null = null;
    if (!cart) {
      const created = await createCart(tx, now);
      cart = created.cart;
      newToken = created.token;
    }
    await lockCart(tx, cart.id);
    const current = (await findCart(tx, newToken ?? token ?? "", now)) ?? cart;

    const variant = await findVariantBySku(tx, input.sku, now);
    const result = validateAdd(variant, input, current.lines);
    if (!result.ok) throw toAppError(result.error);

    await saveLine(tx, current.id, {
      key: result.key,
      variantId: variant?.variantId ?? "",
      quantity: result.quantity,
      extras: result.extras,
    });
    await touchCart(tx, current.id, now);
    const saved = await findCart(tx, newToken ?? token ?? "", now);
    return { cart: await viewCart(tx, saved, now), newToken };
  });
}

/** Carrito vigente del token para modificarlo, bloqueado; 404 si no hay. */
async function lockedCart(tx: Db, token: string | undefined, now: Date): Promise<CartRecord> {
  const cart = token ? await findCart(tx, token, now) : null;
  if (!cart || !token) throw errors.notFound("No encontramos tu carrito");
  await lockCart(tx, cart.id);
  return (await findCart(tx, token, now)) ?? cart;
}

/** PATCH /cart/items/{id}: cambia la cantidad (0 quita la línea). */
export async function updateItem(
  prisma: PrismaClient,
  token: string | undefined,
  lineId: string,
  quantity: number,
  now = new Date(),
): Promise<CartDto> {
  if (!token) throw errors.notFound("No encontramos tu carrito");
  return prisma.$transaction(async (tx) => {
    const cart = await lockedCart(tx, token, now);
    const line = cart.lines.find((l) => l.id === lineId);
    if (!line) throw errors.notFound("Esa línea ya no está en tu carrito");

    const others = cart.lines
      .filter((l) => l.sku === line.sku && l.id !== line.id)
      .reduce((n, l) => n + l.quantity, 0);
    const problem = quantityError(quantity, others);
    if (problem) {
      throw errors.validation(problem, {
        issues: [{ location: "body", path: "quantity", message: problem }],
      });
    }
    await setLineQuantity(tx, cart.id, lineId, quantity);
    await touchCart(tx, cart.id, now);
    return viewCart(tx, await findCart(tx, token ?? "", now), now);
  });
}

/** DELETE /cart/items/{id}: quita la línea. */
export async function removeItem(
  prisma: PrismaClient,
  token: string | undefined,
  lineId: string,
  now = new Date(),
): Promise<CartDto> {
  if (!token) throw errors.notFound("No encontramos tu carrito");
  return prisma.$transaction(async (tx) => {
    const cart = await lockedCart(tx, token, now);
    if (!(await removeLine(tx, cart.id, lineId))) {
      throw errors.notFound("Esa línea ya no está en tu carrito");
    }
    await touchCart(tx, cart.id, now);
    return viewCart(tx, await findCart(tx, token ?? "", now), now);
  });
}

// ─── Cupón (RF-07) ──────────────────────────────────────────────────────────

/**
 * POST /cart/coupon: aplica un cupón al carrito (uno por carrito: reemplaza al
 * anterior). Se valida con el subtotal de hoy; el uso se reserva recién al
 * crear el pedido (LN-09, reserveCouponUse). 409 si no se puede usar.
 */
export async function applyCoupon(
  prisma: PrismaClient,
  token: string | undefined,
  rawCode: string,
  now = new Date(),
): Promise<CartDto> {
  if (!token) throw errors.notFound("No encontramos tu carrito");
  return prisma.$transaction(async (tx) => {
    const cart = await lockedCart(tx, token, now);
    const view = await viewCart(tx, { ...cart, couponId: null }, now);
    if (view.lines.length === 0) {
      throw errors.conflict("Agrega productos al carrito antes de usar un cupón.");
    }
    const row = await tx.coupon.findUnique({ where: { code: normalizeCouponCode(rawCode) } });
    const check = checkCoupon(toCouponRow(row), view.totals.subtotal, chileDay(now));
    if (!check.ok || !row) {
      const message = check.ok ? "Ese cupón no existe." : check.message;
      throw errors.conflict(message, { reason: check.ok ? "not_found" : check.reason });
    }
    await setCartCoupon(tx, cart.id, row.id);
    await touchCart(tx, cart.id, now);
    return viewCart(tx, await findCart(tx, token ?? "", now), now);
  });
}

/** DELETE /cart/coupon: quita el cupón. Sin carrito responde uno vacío (idempotente). */
export async function removeCoupon(
  prisma: PrismaClient,
  token: string | undefined,
  now = new Date(),
): Promise<CartDto> {
  const cart = token ? await findCart(prisma, token, now) : null;
  if (!cart) return viewCart(prisma, null, now);
  if (cart.couponId) {
    await setCartCoupon(prisma, cart.id, null);
    await touchCart(prisma, cart.id, now);
  }
  return viewCart(prisma, { ...cart, couponId: null, couponCode: null }, now);
}

// ─── Despacho (RF-08, RF-11) ────────────────────────────────────────────────

/**
 * GET /shipping/quote: costo de entrega para el carrito actual (o 0 sin
 * carrito). Retiro gratis; despacho gratis desde el umbral o tarifa de la zona
 * de la comuna; sin zona o tarifa a coordinar, por confirmar (null).
 */
export async function quoteShippingForCart(
  prisma: PrismaClient,
  token: string | undefined,
  input: { method: DeliveryMethod; region?: string | undefined; commune?: string | undefined },
  now = new Date(),
): Promise<ShippingQuote> {
  const cart = token ? await findCart(prisma, token, now) : null;
  const { totals } = await viewCart(prisma, cart, now);
  const [settings, zone] = await Promise.all([
    prisma.setting.findUnique({ where: { id: 1 } }),
    input.method === "despacho" && input.region && input.commune
      ? prisma.shippingZone.findFirst({
          where: {
            region: input.region,
            commune: { equals: input.commune.trim(), mode: "insensitive" },
          },
        })
      : null,
  ]);
  // Descuento antes del despacho: el umbral se mide sobre lo que paga el comprador.
  const base = totals.subtotal - totals.discount;
  return quoteShipping(input.method, base, zone, settings?.freeShippingThreshold ?? null);
}
