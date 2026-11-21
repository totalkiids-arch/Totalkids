/**
 * Ficha de producto: fotos, variantes, extras y las reglas de compra (RF-03, RF-04).
 * Dominio puro. Los precios son CLP enteros; null mientras no estén definidos.
 */
import type { ProductImage, ProductSummary } from "./product";

/** Unidades máximas por línea que se pueden agregar desde la ficha. */
export const MAX_QUANTITY_PER_LINE = 9;

/** Desde cuántas unidades disponibles se avisa "últimas unidades". */
export const LOW_STOCK_THRESHOLD = 3;

/**
 * Combinación comprable con su SKU, precio y stock. Un producto sin variantes
 * tiene una sola, con `option` null; con variantes, `option` es su nombre
 * ("1 plaza", "Azul") y `ProductDetail.optionName` dice qué se elige.
 */
export interface ProductVariant {
  sku: string;
  option: string | null;
  price: number | null;
  /** Precio anterior, solo si la variante está en oferta. */
  compareAtPrice: number | null;
  /** Stock disponible = físico − reservado (RN-03). */
  available: number;
}

/** Servicio o personalización que se suma a la línea (RF-04). */
export interface ProductExtra {
  id: string;
  label: string;
  price: number | null;
  /** Si existe, el extra pide un texto (p. ej. el nombre del niño). */
  personalization: { label: string; hint: string; maxLength: number } | null;
}

export interface ProductMeasure {
  label: string;
  value: string;
}

export interface ProductDetail extends ProductSummary {
  /** Todas las fotos, la principal primero. */
  images: readonly ProductImage[];
  /** Párrafos de la pestaña Descripción. */
  description: readonly string[];
  /** Ficha técnica: material, terminación, incluye… */
  specs: readonly ProductMeasure[];
  dimensions: readonly ProductMeasure[];
  /** Pasos de la pestaña Armado y cuidado. */
  care: readonly string[];
  /** Pestaña Cómo aprende jugando; vacía = no se muestra. */
  learning: readonly { title: string; text: string }[];
  /** Frase de Tito en la descripción. */
  mascotQuote: string | null;
  /** Qué se elige entre variantes ("Tamaño", "Color"); null si hay una sola. */
  optionName: string | null;
  variants: readonly ProductVariant[];
  extras: readonly ProductExtra[];
  /** Cuotas sin interés; null mientras no esté definido. */
  installments: number | null;
  /** Plazo para mostrar ("3 a 5 días hábiles"); null = pendiente. */
  leadTime: string | null;
  warrantyMonths: number | null;
  /** Atributo destacado junto a plazo y garantía. */
  highlight: string;
}

export function findVariant(
  detail: Pick<ProductDetail, "variants">,
  option: string | null,
): ProductVariant | null {
  return detail.variants.find((v) => v.option === option) ?? null;
}

/** Opción inicial: la primera variante con stock; si no hay, la primera. */
export function initialOption(detail: Pick<ProductDetail, "variants">): string | null {
  const first = detail.variants.find((v) => v.available > 0) ?? detail.variants[0];
  if (!first) throw new Error("El producto no tiene variantes");
  return first.option;
}

/**
 * Disponibilidad para mostrar. Todo se fabrica a pedido: sin unidades
 * terminadas el producto igual se puede comprar, como reserva.
 */
export type StockStatus =
  { kind: "in-stock" } | { kind: "low"; units: number } | { kind: "made-to-order" };

export function stockStatus(variant: Pick<ProductVariant, "available">): StockStatus {
  if (variant.available <= 0) return { kind: "made-to-order" };
  if (variant.available <= LOW_STOCK_THRESHOLD) return { kind: "low", units: variant.available };
  return { kind: "in-stock" };
}

/** La cantidad pedida supera las unidades terminadas: se fabrica a pedido. */
export function isMadeToOrder(variant: Pick<ProductVariant, "available">, quantity = 1): boolean {
  return variant.available < quantity;
}

/** Tope del selector de cantidad. Lo que falte en stock se fabrica a pedido. */
export function maxQuantity(): number {
  return MAX_QUANTITY_PER_LINE;
}

export function clampQuantity(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity) || 1, 1), MAX_QUANTITY_PER_LINE);
}

/** Porcentaje de descuento redondeado; null si falta alguno de los precios. */
export function discountPercent(
  price: number | null,
  compareAtPrice: number | null,
): number | null {
  if (price === null || compareAtPrice === null || compareAtPrice <= price) return null;
  return Math.round((1 - price / compareAtPrice) * 100);
}

/**
 * Total de la línea: (precio de la variante + extras) × cantidad.
 * null si algún precio involucrado todavía no está definido.
 */
export function lineTotal(
  variant: Pick<ProductVariant, "price">,
  extras: readonly Pick<ProductExtra, "price">[],
  quantity: number,
): number | null {
  if (variant.price === null || extras.some((e) => e.price === null)) return null;
  const unit = extras.reduce((sum, e) => sum + (e.price ?? 0), variant.price);
  return unit * quantity;
}

/** Valida el texto de un extra personalizable. Devuelve el mensaje de error o null. */
export function validatePersonalization(
  extra: Pick<ProductExtra, "personalization">,
  text: string,
): string | null {
  if (!extra.personalization) return null;
  const value = text.trim();
  if (value === "") return `Escribe el ${extra.personalization.label.toLowerCase()}.`;
  if (value.length > extra.personalization.maxLength) {
    return `Usa como máximo ${extra.personalization.maxLength} caracteres.`;
  }
  return null;
}
