import type { Prisma } from "../../generated/prisma/client.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { visibleProduct } from "../catalog.js";
import {
  COUPON_EMPTY_MESSAGE,
  couponRejectedMessage,
  couponRejection,
  normalizeCouponCode,
} from "../coupons.js";
import { chileDate } from "./chile-date.js";
import { lineKey, normalizeText } from "./line-key.js";
import {
  type CartNotice,
  type LineSnapshot,
  MAX_LINES,
  MAX_QUANTITY_PER_LINE,
  NOTICE,
  priceCart,
  type PricedCart,
} from "./pricing.js";

/**
 * Carrito en servidor (RF-05 a RF-08). Leer no cambia nada: las líneas que ya
 * no se venden, los extras retirados y un cupón que dejó de valer salen
 * marcados y fuera de los totales. Cada escritura los limpia (`cleanupCart`) e
 * informa lo que quitó. Agregar al carrito no reserva stock (RN-04).
 */

type Db = Prisma.TransactionClient;

export type CartView = PricedCart;

const lineInclude = {
  extras: { include: { extra: true } },
  variant: {
    include: {
      product: {
        include: {
          extras: { include: { extra: true } },
          images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 20 },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type LineRow = Prisma.CartItemGetPayload<{ include: typeof lineInclude }>;

/** Precio, largo y etiqueta efectivos de un extra en un producto (igual que LN-05). */
function effectiveExtra(
  productExtra: { price: number | null; textMaxLength: number | null },
  extra: { price: number | null; textMaxLength: number | null; textLabel: string | null },
) {
  return {
    price: productExtra.price ?? extra.price,
    maxLength: productExtra.textMaxLength ?? extra.textMaxLength ?? 40,
    label: extra.textLabel ?? "Texto",
  };
}

async function visibleProductIds(db: Db, ids: string[], now: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.product.findMany({
    where: { id: { in: ids }, ...visibleProduct(now) },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

function toSnapshot(row: LineRow, visible: ReadonlySet<string>): LineSnapshot {
  const { variant } = row;
  const { product } = variant;
  const image = product.images.find((i) => i.variantId === variant.id) ?? product.images[0] ?? null;
  return {
    id: row.id,
    quantity: row.quantity,
    sku: variant.sku,
    optionLabel: variant.optionLabel,
    variantPrice: variant.price,
    compareAtPrice: variant.compareAtPrice,
    inStock: Math.max(0, variant.stockPhysical - variant.stockReserved),
    sellable: variant.active && visible.has(product.id),
    product: {
      slug: product.slug,
      name: product.name,
      leadTime: product.leadTime,
      image: image
        ? { url: image.url, alt: image.alt, width: image.width, height: image.height }
        : null,
    },
    extras: [...row.extras]
      .sort((a, b) => (a.extra.code < b.extra.code ? -1 : 1))
      .map(({ extra, text }) => {
        const offer = product.extras.find((pe) => pe.extraId === extra.id);
        return {
          code: extra.code,
          name: extra.name,
          text,
          offered: offer !== undefined && extra.available,
          price: offer ? effectiveExtra(offer, extra).price : null,
        };
      }),
  };
}

async function loadLines(db: Db, cartId: string, now: Date) {
  const rows = await db.cartItem.findMany({
    where: { cartId },
    include: lineInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const visible = await visibleProductIds(
    db,
    [...new Set(rows.map((r) => r.variant.productId))],
    now,
  );
  return rows.map((row) => ({ row, snapshot: toSnapshot(row, visible) }));
}

async function freeShippingThreshold(db: Db): Promise<number | null> {
  const setting = await db.setting.findUnique({ where: { id: 1 } });
  return setting?.freeShippingThreshold ?? null;
}

/** Carrito calculado. `cartId` null = carrito vacío (sin cookie o vencido). */
export async function readCart(db: Db, cartId: string | null, now = new Date()): Promise<CartView> {
  const threshold = await freeShippingThreshold(db);
  if (!cartId) {
    return priceCart({ lines: [], coupon: null, freeShippingThreshold: threshold, today: "" });
  }
  const cart = await db.cart.findUniqueOrThrow({
    where: { id: cartId },
    include: { coupon: true },
  });
  const lines = await loadLines(db, cartId, now);
  return priceCart({
    lines: lines.map((l) => l.snapshot),
    coupon: cart.coupon,
    freeShippingThreshold: threshold,
    today: chileDate(now),
  });
}

/**
 * Quita lo que ya no se puede comprar: líneas de productos o variantes inactivos,
 * extras retirados (si la línea queda igual a otra, se juntan con el tope por
 * línea) y el cupón que dejó de valer. Devuelve los avisos de lo que cambió.
 */
export async function cleanupCart(db: Db, cartId: string, now = new Date()) {
  const notices: CartNotice[] = [];
  const lines = await loadLines(db, cartId, now);

  const unavailable = lines.filter((l) => !l.snapshot.sellable);
  if (unavailable.length > 0) {
    await db.cartItem.deleteMany({ where: { id: { in: unavailable.map((l) => l.row.id) } } });
    notices.push(NOTICE.productsRemoved(unavailable.length));
  }

  const kept = lines.filter((l) => l.snapshot.sellable);
  const quantities = new Map(kept.map((l) => [l.row.lineKey, l.row]));
  let extraRemoved = false;
  for (const { row, snapshot } of kept) {
    const offered = snapshot.extras.filter((e) => e.offered);
    if (offered.length === snapshot.extras.length) continue;
    extraRemoved = true;
    const gone = row.extras.filter((e) => !offered.some((o) => o.code === e.extra.code));
    await db.cartItemExtra.deleteMany({
      where: { cartItemId: row.id, extraId: { in: gone.map((e) => e.extraId) } },
    });
    const key = lineKey(snapshot.sku, offered);
    quantities.delete(row.lineKey);
    const twin = quantities.get(key);
    if (twin) {
      const sum = twin.quantity + row.quantity;
      const quantity = Math.min(sum, MAX_QUANTITY_PER_LINE);
      await db.cartItem.update({ where: { id: twin.id }, data: { quantity } });
      await db.cartItem.delete({ where: { id: row.id } });
      twin.quantity = quantity;
      if (quantity < sum) notices.push(NOTICE.quantityAdjusted(quantity));
    } else {
      await db.cartItem.update({ where: { id: row.id }, data: { lineKey: key } });
      quantities.set(key, { ...row, lineKey: key });
    }
  }
  if (extraRemoved) notices.unshift(NOTICE.extraRemoved());

  const cart = await db.cart.findUniqueOrThrow({
    where: { id: cartId },
    include: { coupon: true },
  });
  if (cart.coupon && couponRejection(cart.coupon, chileDate(now)) !== null) {
    await db.cart.update({ where: { id: cartId }, data: { couponId: null } });
    notices.push(NOTICE.couponRemoved(cart.coupon.code));
  }
  return notices;
}

/**
 * Corre una escritura sobre el carrito con su fila bloqueada (dos pestañas a la
 * vez no se pisan), limpia y devuelve el carrito calculado con los avisos.
 */
export async function writeCart(
  prisma: PrismaClient,
  cartId: string,
  operation: (tx: Db) => Promise<void>,
  now = new Date(),
): Promise<CartView> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
    await operation(tx);
    const notices = await cleanupCart(tx, cartId, now);
    const view = await readCart(tx, cartId, now);
    return { ...view, notices: [...notices, ...view.notices] };
  });
}

function unprocessable(path: string, message: string, extra: Record<string, unknown> = {}) {
  return errors.validation(message, { ...extra, issues: [{ location: "body", path, message }] });
}

export interface AddItemInput {
  sku: string;
  quantity: number;
  extras: string[];
  texts: Record<string, string>;
}

/** Agrega una variante (RF-05). La misma combinación suma; otra combinación es otra línea. */
export async function addItem(db: Db, cartId: string, input: AddItemInput, now = new Date()) {
  const sku = input.sku.trim().toUpperCase();
  const variant = await db.productVariant.findUnique({
    where: { sku },
    include: { product: { include: { extras: { include: { extra: true } } } } },
  });
  const visible = variant
    ? await visibleProductIds(db, [variant.productId], now)
    : new Set<string>();
  if (!variant?.active || !visible.has(variant.productId)) {
    throw errors.notFound("Este producto ya no está disponible.");
  }
  if (variant.price === null) {
    throw unprocessable("sku", "Este producto aún no tiene precio. Escríbenos y lo cotizamos.");
  }

  const { _sum } = await db.cartItem.aggregate({
    where: { cartId, variantId: variant.id },
    _sum: { quantity: true },
  });
  const left = MAX_QUANTITY_PER_LINE - (_sum.quantity ?? 0);
  if (input.quantity > left) {
    throw unprocessable(
      "quantity",
      left <= 0
        ? `Ya tienes ${String(MAX_QUANTITY_PER_LINE)} unidades en el carrito. Para más, escríbenos y lo cotizamos.`
        : `Solo puedes agregar ${String(left)} ${left === 1 ? "unidad más" : "unidades más"}.`,
    );
  }

  const chosen: { extraId: string; code: string; text: string | null }[] = [];
  for (const code of new Set(input.extras)) {
    const offer = variant.product.extras.find((pe) => pe.extra.code === code);
    if (!offer?.extra.available) {
      throw unprocessable("extras", "Uno de los servicios elegidos ya no está disponible.");
    }
    let text: string | null = null;
    if (offer.extra.requiresText) {
      const { maxLength, label } = effectiveExtra(offer, offer.extra);
      text = normalizeText(input.texts[code] ?? "");
      if (text === "" || [...text].length > maxLength) {
        throw unprocessable(
          `texts.${code}`,
          `Revisa el ${label.toLowerCase()} (máximo ${String(maxLength)} caracteres).`,
        );
      }
    }
    chosen.push({ extraId: offer.extraId, code, text });
  }

  const key = lineKey(variant.sku, chosen);
  const existing = await db.cartItem.findUnique({
    where: { cartId_lineKey: { cartId, lineKey: key } },
  });
  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + input.quantity },
    });
    return;
  }
  if ((await db.cartItem.count({ where: { cartId } })) >= MAX_LINES) {
    throw unprocessable("sku", `El carrito admite hasta ${String(MAX_LINES)} productos distintos.`);
  }
  await db.cartItem.create({
    data: {
      cartId,
      variantId: variant.id,
      lineKey: key,
      quantity: input.quantity,
      extras: { create: chosen.map(({ extraId, text }) => ({ extraId, text })) },
    },
  });
}

export const LINE_NOT_FOUND = "No encontramos ese producto en tu carrito.";

/** Solo líneas del carrito propio: una ajena responde igual que una inexistente (404). */
async function ownLine(db: Db, cartId: string, id: string) {
  const line = await db.cartItem.findFirst({ where: { id, cartId } });
  if (!line) throw errors.notFound(LINE_NOT_FOUND);
  return line;
}

/** Cambia la cantidad de una línea sin pasar el tope por SKU (sumando sus otras líneas). */
export async function updateItem(db: Db, cartId: string, id: string, quantity: number) {
  const line = await ownLine(db, cartId, id);
  const { _sum } = await db.cartItem.aggregate({
    where: { cartId, variantId: line.variantId, id: { not: line.id } },
    _sum: { quantity: true },
  });
  const max = MAX_QUANTITY_PER_LINE - (_sum.quantity ?? 0);
  if (quantity > max) {
    throw unprocessable(
      "quantity",
      `Puedes tener hasta ${String(MAX_QUANTITY_PER_LINE)} unidades de este producto: en esta línea, como máximo ${String(max)}.`,
    );
  }
  await db.cartItem.update({ where: { id: line.id }, data: { quantity } });
}

export async function removeItem(db: Db, cartId: string, id: string) {
  const line = await ownLine(db, cartId, id);
  await db.cartItem.delete({ where: { id: line.id } });
}

/**
 * Aplica un cupón (RF-07). Uno por carrito: aplicar otro lo reemplaza. No
 * reserva usos: eso ocurre al crear el pedido (`reserveCouponUse`, LN-09).
 */
export async function applyCoupon(
  db: Db,
  cartId: string | null,
  rawCode: string,
  now = new Date(),
) {
  const code = normalizeCouponCode(rawCode);
  if (code === "") throw unprocessable("code", COUPON_EMPTY_MESSAGE, { reason: "empty" });
  const coupon = await db.coupon.findUnique({ where: { code } });
  const reason = couponRejection(coupon, chileDate(now));
  if (!coupon || reason !== null) {
    throw unprocessable("code", couponRejectedMessage(rawCode.trim()), { reason });
  }
  const lines = cartId ? await loadLines(db, cartId, now) : [];
  if (!cartId || !lines.some((l) => l.snapshot.sellable)) {
    throw unprocessable("code", "Agrega productos antes de aplicar un cupón.", {
      reason: "empty_cart",
    });
  }
  await db.cart.update({ where: { id: cartId }, data: { couponId: coupon.id } });
}

export async function removeCoupon(db: Db, cartId: string) {
  await db.cart.update({ where: { id: cartId }, data: { couponId: null } });
}
