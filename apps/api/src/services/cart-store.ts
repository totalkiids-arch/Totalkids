import type { Prisma } from "../generated/prisma/client.js";
import type { CatalogVariant, OfferedExtra, StoredExtra, StoredLine } from "../domain/cart.js";
import { DEFAULT_TEXT_MAX_LENGTH } from "../domain/cart.js";
import type { PrismaClient } from "../lib/prisma.js";
import { hashToken, randomToken } from "../lib/secrets.js";
import { visibleProduct } from "./catalog.js";

/**
 * Repositorio del carrito de invitado (LN-06): lee y escribe carts, cart_items
 * y cart_item_extras, y lee el catálogo vigente que el dominio revalida
 * (src/domain/cart.ts). No calcula precios ni decide reglas.
 */

/** El carrito dura 30 días desde su última modificación. */
export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Cliente de Prisma o transacción. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface CartLineRecord extends StoredLine {
  sku: string;
  /** Combinación variante + extras + textos (cart_items.line_key). */
  key: string;
}

export interface CartRecord {
  id: string;
  couponId: string | null;
  couponCode: string | null;
  expiresAt: Date;
  /** En el orden en que se agregaron. */
  lines: CartLineRecord[];
}

const cartInclude = {
  coupon: { select: { code: true } },
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      variant: { select: { sku: true } },
      extras: { select: { extraId: true, text: true } },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function toRecord(cart: CartWithItems): CartRecord {
  return {
    id: cart.id,
    couponId: cart.couponId,
    couponCode: cart.coupon?.code ?? null,
    expiresAt: cart.expiresAt,
    lines: cart.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      sku: item.variant.sku,
      key: item.lineKey,
      quantity: item.quantity,
      extras: item.extras.map((e): StoredExtra => ({ extraId: e.extraId, text: e.text })),
    })),
  };
}

const expiry = (now: Date) => new Date(now.getTime() + CART_TTL_MS);

// ─── Sesión ─────────────────────────────────────────────────────────────────

/** Carrito vigente del token, o null si no existe o venció. */
export async function findCart(
  db: Db,
  token: string,
  now = new Date(),
): Promise<CartRecord | null> {
  const cart = await db.cart.findUnique({
    where: { guestTokenHash: hashToken(token) },
    include: cartInclude,
  });
  if (!cart || cart.expiresAt <= now) return null;
  return toRecord(cart);
}

/** Crea un carrito vacío. El token en claro solo vuelve aquí (va a la cookie). */
export async function createCart(
  db: Db,
  now = new Date(),
): Promise<{ token: string; cart: CartRecord }> {
  const token = randomToken();
  const cart = await db.cart.create({
    data: { guestTokenHash: hashToken(token), expiresAt: expiry(now) },
    include: cartInclude,
  });
  return { token, cart: toRecord(cart) };
}

/** Renueva el vencimiento: el carrito vive 30 días desde su último cambio. */
export async function touchCart(db: Db, cartId: string, now = new Date()): Promise<void> {
  await db.cart.update({ where: { id: cartId }, data: { expiresAt: expiry(now) } });
}

/** Borra los carritos vencidos (para un proceso periódico). Devuelve cuántos. */
export async function deleteExpiredCarts(db: Db, now = new Date()): Promise<number> {
  const { count } = await db.cart.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}

// ─── Líneas ─────────────────────────────────────────────────────────────────

/**
 * Guarda una línea validada por el dominio. Si la combinación ya está en el
 * carrito, suma la cantidad (el dominio ya verificó el máximo por SKU).
 */
export async function saveLine(
  db: Db,
  cartId: string,
  line: { key: string; variantId: string; quantity: number; extras: readonly StoredExtra[] },
): Promise<void> {
  const existing = await db.cartItem.findUnique({
    where: { cartId_lineKey: { cartId, lineKey: line.key } },
  });
  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + line.quantity },
    });
    return;
  }
  await db.cartItem.create({
    data: {
      cartId,
      variantId: line.variantId,
      lineKey: line.key,
      quantity: line.quantity,
      extras: { create: line.extras.map((e) => ({ extraId: e.extraId, text: e.text })) },
    },
  });
}

/** Cambia la cantidad de una línea del carrito (0 la quita). false si no es de este carrito. */
export async function setLineQuantity(
  db: Db,
  cartId: string,
  lineId: string,
  quantity: number,
): Promise<boolean> {
  if (quantity === 0) return removeLine(db, cartId, lineId);
  const { count } = await db.cartItem.updateMany({
    where: { id: lineId, cartId },
    data: { quantity },
  });
  return count === 1;
}

/** Quita una línea del carrito. false si no es de este carrito. */
export async function removeLine(db: Db, cartId: string, lineId: string): Promise<boolean> {
  const { count } = await db.cartItem.deleteMany({ where: { id: lineId, cartId } });
  return count === 1;
}

/**
 * Limpia los extras que el catálogo dejó de ofrecer (ver priceCart). La línea
 * conserva su line_key original: sigue siendo única dentro del carrito.
 */
export async function dropExtras(db: Db, dropped: ReadonlyMap<string, readonly string[]>) {
  for (const [cartItemId, extraIds] of dropped) {
    await db.cartItemExtra.deleteMany({ where: { cartItemId, extraId: { in: [...extraIds] } } });
  }
}

/** Fija o quita el cupón del carrito. */
export async function setCartCoupon(db: Db, cartId: string, couponId: string | null) {
  await db.cart.update({ where: { id: cartId }, data: { couponId } });
}

// ─── Catálogo vigente ───────────────────────────────────────────────────────

const variantInclude = {
  product: {
    include: {
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1 },
      extras: {
        where: { extra: { available: true } },
        orderBy: { sortOrder: "asc" },
        include: { extra: true },
      },
    },
  },
} satisfies Prisma.ProductVariantInclude;

type VariantWithProduct = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;

function toCatalogVariant(v: VariantWithProduct): CatalogVariant {
  const extras = v.product.extras.map(({ extra, price, textMaxLength }): OfferedExtra => ({
    extraId: extra.id,
    code: extra.code,
    name: extra.name,
    // Precio y largo propios del producto; si no, los del extra.
    price: price ?? extra.price,
    personalization: extra.requiresText
      ? {
          label: extra.textLabel ?? "Texto",
          maxLength: textMaxLength ?? extra.textMaxLength ?? DEFAULT_TEXT_MAX_LENGTH,
        }
      : null,
  }));
  return {
    variantId: v.id,
    sku: v.sku,
    productSlug: v.product.slug,
    productName: v.product.name,
    optionLabel: v.optionLabel,
    imageUrl: v.product.images[0]?.url ?? null,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    available: Math.max(0, v.stockPhysical - v.stockReserved),
    leadTime: v.product.leadTime,
    extras,
  };
}

/** Solo se vende una variante activa de un producto visible en la tienda. */
function sellableWhere(now: Date): Prisma.ProductVariantWhereInput {
  return { active: true, product: visibleProduct(now) };
}

/**
 * Variantes por id, tal como están hoy. Una variante que ya no se vende
 * (desactivada, producto oculto o despublicado) queda como null.
 */
export async function loadVariants(
  db: Db,
  variantIds: readonly string[],
  now = new Date(),
): Promise<Map<string, CatalogVariant | null>> {
  const ids = [...new Set(variantIds)];
  const rows =
    ids.length === 0
      ? []
      : await db.productVariant.findMany({
          where: { id: { in: ids }, ...sellableWhere(now) },
          include: variantInclude,
        });
  const found = new Map(rows.map((row) => [row.id, toCatalogVariant(row)]));
  return new Map(ids.map((id) => [id, found.get(id) ?? null]));
}

/** Variante vendible por SKU, o null. */
export async function findVariantBySku(
  db: Db,
  sku: string,
  now = new Date(),
): Promise<CatalogVariant | null> {
  const row = await db.productVariant.findFirst({
    where: { sku, ...sellableWhere(now) },
    include: variantInclude,
  });
  return row ? toCatalogVariant(row) : null;
}
