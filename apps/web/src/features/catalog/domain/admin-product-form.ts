/**
 * Valores del formulario de producto (texto tal como se escribió) y su
 * conversión a `ProductDraft`. Guardar el texto original permite devolver el
 * formulario con lo que la persona escribió aunque sea inválido ("12.990").
 */
import type { AdminProduct, ExtraOption, ProductDraft, ProductStatus } from "./admin-product";
import { LEVELS, MATERIALS } from "./product";

/** Prefijo del id temporal de una variante que aún no existe en la API. */
export const NEW_VARIANT_PREFIX = "nueva-";

export function isNewVariantId(id: string): boolean {
  return id.startsWith(NEW_VARIANT_PREFIX);
}

export interface VariantFormValues {
  /** Id de la API, o "nueva-…" si aún no existe. */
  id: string;
  sku: string;
  option: string;
  price: string;
  compareAtPrice: string;
  /** Stock inicial (variantes nuevas) o el físico actual (solo se muestra). */
  physical: string;
  /** Solo para mostrar; el servidor usa las reservas que tiene guardadas. */
  reserved: number;
}

export interface ExtraFormValues {
  code: string;
  name: string;
  requiresText: boolean;
  offered: boolean;
  /** Vacío = el precio general del extra. */
  price: string;
  /** Vacío = el límite general del extra. */
  textMaxLength: string;
  /** Lo general del extra, para la ayuda del formulario. */
  defaultPrice: number | null;
  defaultTextMaxLength: number | null;
}

export interface ProductFormValues {
  name: string;
  category: string;
  categories: string[];
  levels: string[];
  materials: string[];
  description: string;
  dimensions: string;
  optionName: string;
  variants: VariantFormValues[];
  extras: ExtraFormValues[];
  /** «Visible en el catálogo». */
  publish: boolean;
  /** Estado guardado (null al crear), para explicar borrador o inactivo. */
  status: ProductStatus | null;
  images: { id: string; src: string; width: number | null; height: number | null; alt: string }[];
  /** Texto alternativo de la imagen nueva (el archivo hay que volver a elegirlo si hubo errores). */
  newImageAlt: string;
}

/** Texto a número: vacío o con separadores ("12.990", "12,5") no es un entero válido. */
export function parseAmount(text: string): number {
  const value = text.trim();
  if (value === "" || !/^-?\d+(\.\d+)?$/.test(value)) return Number.NaN;
  return Number(value);
}

/** Precio anterior opcional: vacío o 0 = sin precio anterior. */
function parseOptionalAmount(text: string): number | null {
  const value = text.trim();
  if (value === "" || value === "0") return null;
  return parseAmount(value);
}

/** Opcional: vacío = null (el valor general). */
function parseOptional(text: string): number | null {
  return text.trim() === "" ? null : parseAmount(text);
}

const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);
const MATERIAL_SLUGS: readonly string[] = MATERIALS.map((m) => m.slug);

export function toProductDraft(
  values: ProductFormValues,
  newImage: { type: string; size: number } | null,
): ProductDraft {
  const single = values.variants.length <= 1;
  return {
    name: values.name.trim(),
    category: values.category,
    // La principal siempre está incluida y va primero.
    categories: [values.category, ...values.categories.filter((c) => c !== values.category)],
    levels: values.levels.filter((l) => LEVEL_IDS.includes(l)),
    materials: values.materials.filter((m) => MATERIAL_SLUGS.includes(m)),
    description: values.description.trim(),
    dimensions: values.dimensions.trim(),
    optionName: single ? "" : values.optionName.trim(),
    variants: values.variants.map((v) => ({
      id: isNewVariantId(v.id) ? null : v.id,
      sku: v.sku.trim(),
      option: single ? null : v.option.trim(),
      price: parseAmount(v.price),
      compareAtPrice: parseOptionalAmount(v.compareAtPrice),
      physical: parseAmount(v.physical),
    })),
    extras: values.extras.map((e) => ({
      code: e.code,
      offered: e.offered,
      price: parseOptional(e.price),
      textMaxLength: e.requiresText ? parseOptional(e.textMaxLength) : null,
    })),
    publish: values.publish,
    imageAlts: values.images.map((image) => image.alt.trim()),
    newImage: newImage ? { ...newImage, alt: values.newImageAlt.trim() } : null,
  };
}

/** Los extras de la tienda, marcando los que ofrece el producto. */
function extrasToFormValues(
  options: readonly ExtraOption[],
  offered: AdminProduct["extras"],
): ExtraFormValues[] {
  return options.map((option) => {
    const own = offered.find((e) => e.code === option.code);
    return {
      code: option.code,
      name: option.name,
      requiresText: option.requiresText,
      offered: Boolean(own),
      price: own?.price === null || own === undefined ? "" : String(own.price),
      textMaxLength:
        own?.textMaxLength === null || own === undefined ? "" : String(own.textMaxLength),
      defaultPrice: option.price,
      defaultTextMaxLength: option.textMaxLength,
    };
  });
}

export function productToFormValues(
  product: AdminProduct,
  extraOptions: readonly ExtraOption[],
): ProductFormValues {
  return {
    name: product.name,
    category: product.category,
    categories: product.categories.filter((c) => c !== product.category),
    levels: [...product.levels],
    materials: [...product.materials],
    description: product.description,
    dimensions: product.dimensions,
    optionName: product.optionName ?? "",
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      option: v.option ?? "",
      price: v.price === null ? "" : String(v.price),
      compareAtPrice: v.compareAtPrice === null ? "" : String(v.compareAtPrice),
      physical: String(v.physical),
      reserved: v.reserved,
    })),
    extras: extrasToFormValues(extraOptions, product.extras),
    publish: product.status === "active",
    status: product.status,
    images: product.images.map((image) => ({ ...image })),
    newImageAlt: "",
  };
}

/** Formulario vacío para "Nuevo producto": una variante sin datos (nace como borrador). */
export function emptyProductFormValues(
  defaultCategory: string,
  variantId: string,
  extraOptions: readonly ExtraOption[],
): ProductFormValues {
  return {
    name: "",
    category: defaultCategory,
    categories: [],
    levels: [],
    materials: [],
    description: "",
    dimensions: "",
    optionName: "",
    variants: [emptyVariant(variantId)],
    extras: extrasToFormValues(extraOptions, []),
    // Publicar exige una imagen: un producto nuevo parte como borrador.
    publish: false,
    status: null,
    images: [],
    newImageAlt: "",
  };
}

/** Variante vacía con id temporal ("nueva-…"). */
export function emptyVariant(id: string): VariantFormValues {
  return { id, sku: "", option: "", price: "", compareAtPrice: "", physical: "0", reserved: 0 };
}

/** id HTML de un campo a partir de su ruta ("variants.0.sku" → "campo-variants-0-sku"). */
export function fieldId(path: string): string {
  return `campo-${path.replace(/\./g, "-")}`;
}
