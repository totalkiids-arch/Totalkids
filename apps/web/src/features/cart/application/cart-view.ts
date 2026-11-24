import { z } from "zod";

/*
 * Carrito tal como lo calcula la API (LN-06, GET /cart y cada escritura): las
 * líneas con su precio vigente, avisos, cupón y totales. La tienda no calcula
 * importes (RNF-03): solo los muestra. Puro, para poder probarlo.
 */

/**
 * Cookie con solo la cantidad de unidades del carrito (no HttpOnly): el botón
 * del encabezado la lee en el navegador. La cookie del carrito en sí es opaca
 * y HttpOnly (la emite la API).
 */
export const CART_UNITS_COOKIE = "tk_carrito_unidades";

/** Unidades máximas por línea y por SKU (igual que la API y la ficha). */
export const MAX_QUANTITY_PER_LINE = 9;

const nullableInt = z.number().int().nullable();

const Notice = z.object({ code: z.string(), message: z.string() });

const Line = z.object({
  id: z.string(),
  sku: z.string(),
  optionLabel: z.string().nullable(),
  quantity: z.number().int(),
  status: z.enum(["ok", "unpriced", "unavailable"]),
  product: z.object({
    slug: z.string(),
    name: z.string(),
    image: z
      .object({ url: z.string(), alt: z.string(), width: nullableInt, height: nullableInt })
      .nullable(),
  }),
  variantPrice: nullableInt,
  unitPrice: nullableInt,
  lineTotal: nullableInt,
  extras: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      price: nullableInt,
      text: z.string().nullable(),
    }),
  ),
  availability: z.object({
    status: z.enum(["en_stock", "mixto", "a_pedido"]),
    message: z.string(),
  }),
  notices: z.array(Notice),
});

export const ApiCart = z.object({
  lines: z.array(Line),
  notices: z.array(Notice),
  coupon: z.object({ code: z.string(), discount: z.number().int(), valid: z.boolean() }).nullable(),
  totals: z.object({
    units: z.number().int(),
    subtotal: z.number().int(),
    discount: z.number().int(),
    totalWithoutShipping: z.number().int(),
    unpriced: z.array(z.string()),
  }),
  freeShipping: z
    .object({
      threshold: z.number().int(),
      remaining: z.number().int(),
      percent: z.number(),
      reached: z.boolean(),
    })
    .nullable(),
  canCheckout: z.boolean(),
});

export interface CartLineView {
  id: string;
  slug: string;
  name: string;
  image: { src: string; width: number; height: number; alt: string } | null;
  sku: string;
  /** Variante ("1 plaza"); null si el producto no tiene variantes. */
  option: string | null;
  quantity: number;
  status: "ok" | "unpriced" | "unavailable";
  /** Precio de la variante por unidad (sin extras); null sin precio. */
  variantPrice: number | null;
  /** Total de la línea; null sin precio o si ya no se vende. */
  total: number | null;
  extras: { id: string; label: string; price: number | null; text: string | null }[];
  availability: { status: "en_stock" | "mixto" | "a_pedido"; message: string };
  /** Avisos de la línea ("Ya no está a la venta…"), para mostrar bajo ella. */
  notes: string[];
}

export interface CartView {
  lines: CartLineView[];
  /** Avisos del carrito (productos quitados, cupón que dejó de valer…). */
  notices: string[];
  coupon: { code: string; discount: number; valid: boolean } | null;
  units: number;
  subtotal: number;
  discount: number;
  /** subtotal − descuento; el despacho se cotiza en el checkout. */
  total: number;
  /** Productos o servicios con precio por confirmar: no entran al total. */
  unpriced: string[];
  freeShipping: { remaining: number; percent: number; reached: boolean } | null;
  canCheckout: boolean;
}

export const EMPTY_CART: CartView = {
  lines: [],
  notices: [],
  coupon: null,
  units: 0,
  subtotal: 0,
  discount: 0,
  total: 0,
  unpriced: [],
  freeShipping: null,
  canCheckout: false,
};

const IMAGE_SIZE = 1000;

export function toCartView(body: z.infer<typeof ApiCart>): CartView {
  return {
    lines: body.lines.map((line) => ({
      id: line.id,
      slug: line.product.slug,
      name: line.product.name,
      image: line.product.image
        ? {
            src: line.product.image.url,
            alt: line.product.image.alt,
            width: line.product.image.width ?? IMAGE_SIZE,
            height: line.product.image.height ?? IMAGE_SIZE,
          }
        : null,
      sku: line.sku,
      option: line.optionLabel,
      quantity: line.quantity,
      status: line.status,
      variantPrice: line.variantPrice,
      total: line.lineTotal,
      extras: line.extras.map((e) => ({ id: e.code, label: e.name, price: e.price, text: e.text })),
      availability: line.availability,
      notes: line.notices.map((n) => n.message),
    })),
    notices: body.notices.map((n) => n.message),
    coupon: body.coupon,
    units: body.totals.units,
    subtotal: body.totals.subtotal,
    discount: body.totals.discount,
    total: body.totals.totalWithoutShipping,
    unpriced: body.totals.unpriced,
    freeShipping: body.freeShipping,
    canCheckout: body.canCheckout,
  };
}

/** Mensaje del error de la API ({ code, message, … }) si lo trae. */
export function apiMessage(body: unknown): string | null {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}
