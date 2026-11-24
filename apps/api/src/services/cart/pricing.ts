import type { CouponKind } from "../../generated/prisma/enums.js";
import type { ImageDto } from "../catalog.js";
import {
  couponDiscount,
  couponDroppedMessage,
  couponRejection,
  type CouponRejection,
  type CouponRules,
} from "../coupons.js";

/**
 * Cálculo del carrito (RF-06 a RF-08, RN-01). Función pura: recibe las líneas
 * guardadas con los datos vigentes del catálogo y devuelve precios, avisos y
 * totales. Los importes se calculan SOLO aquí, nunca en el navegador (RNF-03).
 */

/** Unidades máximas por línea y por SKU (igual que la ficha y `cart_items_quantity_range`). */
export const MAX_QUANTITY_PER_LINE = 9;
/** Líneas máximas por carrito (igual que la tienda). */
export const MAX_LINES = 30;

export type NoticeCode =
  "product_removed" | "extra_removed" | "quantity_adjusted" | "unpriced" | "coupon_removed";

export interface CartNotice {
  code: NoticeCode;
  message: string;
}

export const NOTICE = {
  extraRemoved: (): CartNotice => ({
    code: "extra_removed",
    message: "Quitamos un servicio que ya no está disponible.",
  }),
  quantityAdjusted: (quantity: number): CartNotice => ({
    code: "quantity_adjusted",
    message: `Ajustamos la cantidad a ${String(quantity)}, el máximo por producto.`,
  }),
  lineUnavailable: (): CartNotice => ({
    code: "product_removed",
    message: "Ya no está a la venta. Lo quitaremos de tu carrito.",
  }),
  productsRemoved: (count: number): CartNotice => ({
    code: "product_removed",
    message:
      count === 1
        ? "Un producto ya no está a la venta y lo quitamos."
        : `${String(count)} productos ya no están a la venta y los quitamos.`,
  }),
  unpriced: (): CartNotice => ({
    code: "unpriced",
    message: "Este producto aún no tiene precio. Escríbenos y lo cotizamos.",
  }),
  couponRemoved: (code: string): CartNotice => ({
    code: "coupon_removed",
    message: couponDroppedMessage(code),
  }),
};

/** Una línea guardada con los datos vigentes de su variante, producto y extras. */
export interface LineSnapshot {
  id: string;
  quantity: number;
  sku: string;
  optionLabel: string | null;
  variantPrice: number | null;
  compareAtPrice: number | null;
  /** Disponible = físico − reservado (RN-03). */
  inStock: number;
  /** Variante activa de un producto visible en la tienda. */
  sellable: boolean;
  product: { slug: string; name: string; leadTime: string | null; image: ImageDto | null };
  extras: {
    code: string;
    name: string;
    text: string | null;
    /** El producto lo sigue ofreciendo y el extra está disponible. */
    offered: boolean;
    /** Precio efectivo (el del producto o el del extra); null = por confirmar. */
    price: number | null;
  }[];
}

export interface CouponSnapshot extends CouponRules {
  code: string;
}

export interface PricingInput {
  lines: readonly LineSnapshot[];
  coupon: CouponSnapshot | null;
  freeShippingThreshold: number | null;
  /** Día de Chile ("YYYY-MM-DD") para la vigencia del cupón. */
  today: string;
}

export type LineStatus = "ok" | "unpriced" | "unavailable";

export interface PricedLine {
  id: string;
  sku: string;
  optionLabel: string | null;
  quantity: number;
  status: LineStatus;
  product: LineSnapshot["product"];
  variantPrice: number | null;
  compareAtPrice: number | null;
  /** Variante + extras con precio, por unidad; null sin precio o no vendible. */
  unitPrice: number | null;
  lineTotal: number | null;
  extras: { code: string; name: string; price: number | null; text: string | null }[];
  availability: {
    status: "en_stock" | "mixto" | "a_pedido";
    inStock: number;
    leadTime: string | null;
    message: string;
  };
  notices: CartNotice[];
}

export interface PricedCart {
  lines: PricedLine[];
  notices: CartNotice[];
  coupon: {
    code: string;
    kind: CouponKind;
    value: number;
    discount: number;
    valid: boolean;
    reason: CouponRejection | null;
  } | null;
  totals: {
    units: number;
    /** Productos y extras con precio de las líneas vendibles (subtotal elegible). */
    subtotal: number;
    discount: number;
    /** subtotal − descuento; el despacho se suma al cotizar la entrega. */
    totalWithoutShipping: number;
    /** Productos o servicios con precio por confirmar: no entran al subtotal. */
    unpriced: string[];
  };
  /** Avance hacia el despacho gratis (RF-08), sobre subtotal − descuento; null sin umbral. */
  freeShipping: { threshold: number; remaining: number; percent: number; reached: boolean } | null;
  /** Hay algo que comprar y ninguna línea sin precio. */
  canCheckout: boolean;
}

function availabilityOf(inStock: number, quantity: number, leadTime: string | null) {
  if (inStock >= quantity) {
    return { status: "en_stock" as const, inStock, leadTime, message: "En stock" };
  }
  // Stock 0 no es «agotado»: se fabrica a pedido con su plazo (UI-11).
  return inStock > 0
    ? {
        status: "mixto" as const,
        inStock,
        leadTime,
        message: `Reserva: ${String(inStock)} en stock, el resto a pedido`,
      }
    : {
        status: "a_pedido" as const,
        inStock: 0,
        leadTime,
        message: "Reserva a pedido: se fabrica al confirmar",
      };
}

export function priceLine(line: LineSnapshot): PricedLine {
  const notices: CartNotice[] = [];
  const extras = line.extras.filter((e) => e.offered);
  if (extras.length < line.extras.length) notices.push(NOTICE.extraRemoved());

  let status: LineStatus = "ok";
  if (!line.sellable) {
    status = "unavailable";
    notices.push(NOTICE.lineUnavailable());
  } else if (line.variantPrice === null) {
    status = "unpriced";
    notices.push(NOTICE.unpriced());
  }

  const unitPrice =
    status === "ok"
      ? extras.reduce((sum, e) => sum + (e.price ?? 0), line.variantPrice ?? 0)
      : null;

  return {
    id: line.id,
    sku: line.sku,
    optionLabel: line.optionLabel,
    quantity: line.quantity,
    status,
    product: line.product,
    variantPrice: line.sellable ? line.variantPrice : null,
    compareAtPrice: line.sellable ? line.compareAtPrice : null,
    unitPrice,
    lineTotal: unitPrice === null ? null : unitPrice * line.quantity,
    extras: extras.map(({ code, name, price, text }) => ({ code, name, price, text })),
    availability: availabilityOf(line.inStock, line.quantity, line.product.leadTime),
    notices,
  };
}

export function priceCart(input: PricingInput): PricedCart {
  const lines = input.lines.map(priceLine);
  const buyable = lines.filter((l) => l.status !== "unavailable");
  const notices: CartNotice[] = [];

  const unpriced = new Set<string>();
  for (const line of buyable) {
    if (line.status === "unpriced") unpriced.add(line.product.name);
    for (const extra of line.extras) if (extra.price === null) unpriced.add(extra.name);
  }

  const subtotal = buyable.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0);

  let coupon: PricedCart["coupon"] = null;
  if (input.coupon) {
    const reason = couponRejection(input.coupon, input.today);
    const discount = reason === null ? couponDiscount(input.coupon, subtotal) : 0;
    coupon = {
      code: input.coupon.code,
      kind: input.coupon.kind,
      value: input.coupon.value,
      discount,
      valid: reason === null,
      reason,
    };
    if (reason !== null) notices.push(NOTICE.couponRemoved(input.coupon.code));
  }
  const discount = coupon?.discount ?? 0;
  const afterDiscount = subtotal - discount;

  const threshold = input.freeShippingThreshold;
  const freeShipping =
    threshold === null || threshold <= 0
      ? null
      : {
          threshold,
          remaining: Math.max(0, threshold - afterDiscount),
          percent: Math.min(100, Math.round((afterDiscount / threshold) * 100)),
          reached: afterDiscount >= threshold,
        };

  return {
    lines,
    notices,
    coupon,
    totals: {
      units: buyable.reduce((sum, l) => sum + l.quantity, 0),
      subtotal,
      discount,
      totalWithoutShipping: afterDiscount,
      unpriced: [...unpriced],
    },
    freeShipping,
    canCheckout: buyable.length > 0 && buyable.every((l) => l.status === "ok"),
  };
}
