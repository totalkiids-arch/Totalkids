/**
 * Valores del formulario de producto (texto tal como se escribió) y su
 * conversión a `ProductDraft`. Guardar el texto original permite devolver el
 * formulario con lo que la persona escribió aunque sea inválido ("12.990").
 */
import type { AdminProduct, ProductDraft } from "./admin-product";
import { LEVELS, MATERIALS, type LevelId, type MaterialSlug } from "./product";

export interface VariantFormValues {
  id: string;
  sku: string;
  option: string;
  price: string;
  compareAtPrice: string;
  physical: string;
  /** Solo para mostrar; el servidor usa las reservas que tiene guardadas. */
  reserved: number;
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
  assemblyPrice: string;
  personalizationPrice: string;
  personalizationMaxLength: string;
  active: boolean;
  images: { src: string; width: number; height: number; alt: string }[];
  newImage: { type: string; size: string; name: string; alt: string } | null;
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

const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);
const MATERIAL_SLUGS: readonly string[] = MATERIALS.map((m) => m.slug);

export function toProductDraft(values: ProductFormValues): ProductDraft {
  const single = values.variants.length <= 1;
  return {
    name: values.name.trim(),
    category: values.category,
    // La principal siempre está incluida y va primero.
    categories: [values.category, ...values.categories.filter((c) => c !== values.category)],
    levels: values.levels.filter((l): l is LevelId => LEVEL_IDS.includes(l)),
    materials: values.materials.filter((m): m is MaterialSlug => MATERIAL_SLUGS.includes(m)),
    description: values.description.trim(),
    dimensions: values.dimensions.trim(),
    optionName: single ? "" : values.optionName.trim(),
    variants: values.variants.map((v) => ({
      id: v.id,
      sku: v.sku.trim(),
      option: single ? null : v.option.trim(),
      price: parseAmount(v.price),
      compareAtPrice: parseOptionalAmount(v.compareAtPrice),
      physical: parseAmount(v.physical),
    })),
    assemblyPrice: parseAmount(values.assemblyPrice),
    personalizationPrice: parseAmount(values.personalizationPrice),
    personalizationMaxLength: parseAmount(values.personalizationMaxLength),
    active: values.active,
    imageAlts: values.images.map((image) => image.alt.trim()),
    newImage: values.newImage
      ? {
          type: values.newImage.type,
          size: Number(values.newImage.size),
          alt: values.newImage.alt.trim(),
        }
      : null,
  };
}

export function productToFormValues(product: AdminProduct): ProductFormValues {
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
      price: String(v.price),
      compareAtPrice: v.compareAtPrice === null ? "" : String(v.compareAtPrice),
      physical: String(v.physical),
      reserved: v.reserved,
    })),
    assemblyPrice: String(product.assemblyPrice),
    personalizationPrice: String(product.personalizationPrice),
    personalizationMaxLength: String(product.personalizationMaxLength),
    active: product.active,
    images: product.images.map((image) => ({ ...image })),
    newImage: null,
  };
}

/** Formulario vacío para "Nuevo producto": una variante sin datos y visible (como la maqueta). */
export function emptyProductFormValues(
  defaultCategory: string,
  variantId: string,
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
    assemblyPrice: "0",
    personalizationPrice: "0",
    personalizationMaxLength: "20",
    active: true,
    images: [],
    newImage: null,
  };
}

export function emptyVariant(id: string): VariantFormValues {
  return { id, sku: "", option: "", price: "", compareAtPrice: "", physical: "0", reserved: 0 };
}

/** id HTML de un campo a partir de su ruta ("variants.0.sku" → "campo-variants-0-sku"). */
export function fieldId(path: string): string {
  return `campo-${path.replace(/\./g, "-")}`;
}
