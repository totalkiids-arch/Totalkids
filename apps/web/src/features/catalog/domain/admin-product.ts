/**
 * Catálogo tal como lo administra el panel: productos con variantes, stock,
 * extras, imágenes y categorías (RF-26), y los ajustes de inventario (RF-34).
 * Dominio puro: solo tipos y reglas, sin React, Next.js ni acceso a datos.
 *
 * Reglas de la SRS que se aplican aquí:
 * - RF-26: SKU único, importes válidos, archivos permitidos; desactivar no borra.
 * - RN-01: importes en CLP, enteros y no negativos.
 * - RN-03: disponible = físico − reservado; un ajuste no deja físico < reservas.
 */
import type { LevelId, MaterialSlug } from "./product";
import { LOW_STOCK_THRESHOLD } from "./product-detail";

export interface AdminVariant {
  id: string;
  sku: string;
  /** Nombre de la opción ("1 plaza", "Azul"); null si el producto tiene una sola variante. */
  option: string | null;
  price: number;
  /** Precio anterior (oferta); null si no hay. */
  compareAtPrice: number | null;
  /** Unidades en bodega. */
  physical: number;
  /** Unidades apartadas por pedidos en curso (RN-03, RN-04). No se editan en el panel. */
  reserved: number;
}

export interface AdminImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  /** Slug de la categoría principal; siempre está incluida en `categories`. */
  category: string;
  categories: readonly string[];
  levels: readonly LevelId[];
  materials: readonly MaterialSlug[];
  description: string;
  /** Texto libre: "Ancho 1,0 m · Fondo 40 cm · Alto 50 cm". */
  dimensions: string;
  /** Qué se elige entre variantes ("Tamaño", "Color"); null con una sola variante. */
  optionName: string | null;
  variants: readonly AdminVariant[];
  /** Extras en CLP; 0 = no disponible (RF-04). */
  assemblyPrice: number;
  personalizationPrice: number;
  /** Largo máximo del texto personalizado. */
  personalizationMaxLength: number;
  /** Visible en el catálogo. Desactivar no borra el producto ni sus pedidos (RF-26). */
  active: boolean;
  images: readonly AdminImage[];
}

export interface AdminCategory {
  slug: string;
  name: string;
  active: boolean;
}

/** Ajuste administrativo de stock físico (RF-34). */
export interface StockAdjustment {
  id: string;
  /** Fecha ISO. */
  at: string;
  /** Responsable; en la demo, el rol de la sesión ("Administrador"). */
  actor: string;
  productName: string;
  sku: string;
  before: number;
  after: number;
  reason: string;
}

/** Errores por campo: clave = ruta del campo ("name", "variants.0.sku"), valor = mensaje. */
export type FieldErrors = Record<string, string>;

export const PRODUCT_NAME_MAX = 120;
export const SKU_MAX = 40;
export const OPTION_MAX = 60;
export const DESCRIPTION_MAX = 4000;
export const STOCK_REASON_MAX = 200;
export const IMAGE_ALT_MAX = 160;
export const CATEGORY_NAME_MAX = 60;
export const PERSONALIZATION_LIMIT = { min: 1, max: 100 } as const;

// ── Importes (RN-01) ─────────────────────────────────────────────────────────

/** Valida un monto CLP: entero ≥ 0. Devuelve el mensaje de error o null. */
export function validateClp(value: number, label = "El monto"): string | null {
  if (!Number.isFinite(value)) return `${label}: escribe un monto en pesos, por ejemplo 129990.`;
  if (!Number.isInteger(value)) return `${label}: usa pesos enteros, sin puntos ni decimales.`;
  if (value < 0) return `${label} no puede ser negativo.`;
  return null;
}

/** El precio anterior es opcional; si existe, debe ser igual o mayor al precio. */
export function validateCompareAt(price: number, compareAtPrice: number | null): string | null {
  if (compareAtPrice === null) return null;
  const invalid = validateClp(compareAtPrice, "El precio anterior");
  if (invalid) return invalid;
  if (Number.isFinite(price) && compareAtPrice < price) {
    return "El precio anterior debe ser igual o mayor al precio actual.";
  }
  return null;
}

// ── SKU ──────────────────────────────────────────────────────────────────────

/** Forma canónica para comparar: sin espacios en los extremos y en mayúsculas. */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

export function validateSkuFormat(sku: string): string | null {
  const value = sku.trim();
  if (value === "") return "Escribe el SKU.";
  if (value.length > SKU_MAX) return `El SKU admite como máximo ${SKU_MAX} caracteres.`;
  if (/\s/.test(value)) return "El SKU no puede tener espacios.";
  return null;
}

/**
 * Índices de las variantes cuyo SKU ya existe en otro producto o se repite
 * dentro del mismo producto. No distingue mayúsculas ("tk-1" = "TK-1").
 */
export function findDuplicateSkus(
  skus: readonly string[],
  otherProductSkus: readonly string[],
): number[] {
  const taken = new Set(otherProductSkus.map(normalizeSku));
  const seen = new Set<string>();
  const duplicates: number[] = [];
  skus.forEach((sku, index) => {
    const key = normalizeSku(sku);
    if (key === "") return;
    if (taken.has(key) || seen.has(key)) duplicates.push(index);
    seen.add(key);
  });
  return duplicates;
}

// ── Stock (RN-03) ────────────────────────────────────────────────────────────

/** Disponible = físico − reservado, nunca negativo. */
export function availableStock(variant: Pick<AdminVariant, "physical" | "reserved">): number {
  return Math.max(0, variant.physical - variant.reserved);
}

export type InventoryStatus = "out" | "low" | "ok";

/** "Stock bajo" usa el mismo umbral que la ficha pública ("últimas unidades"). */
export function inventoryStatus(
  variant: Pick<AdminVariant, "physical" | "reserved">,
): InventoryStatus {
  const available = availableStock(variant);
  if (available === 0) return "out";
  if (available <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

/** Stock físico: entero ≥ 0 y no menor que las reservas vigentes (RN-03). */
export function validatePhysicalStock(physical: number, reserved: number): string | null {
  if (!Number.isFinite(physical) || !Number.isInteger(physical)) {
    return "El stock físico debe ser un número entero de unidades.";
  }
  if (physical < 0) return "El stock físico no puede ser negativo.";
  if (physical < reserved) {
    return `El stock físico no puede ser menor que las ${reserved} unidades reservadas.`;
  }
  return null;
}

/** Ajuste de inventario: nuevo físico válido y motivo obligatorio (RF-34). */
export function validateStockAdjustment(input: {
  physical: number;
  reserved: number;
  reason: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const physical = validatePhysicalStock(input.physical, input.reserved);
  if (physical) errors.physical = physical;
  const reason = input.reason.trim();
  if (reason === "") errors.reason = "Escribe el motivo del ajuste.";
  else if (reason.length > STOCK_REASON_MAX) {
    errors.reason = `El motivo admite como máximo ${STOCK_REASON_MAX} caracteres.`;
  }
  return errors;
}

/** Una variante con reservas no se puede quitar: hay pedidos en curso que la usan. */
export function canRemoveVariant(variant: Pick<AdminVariant, "reserved">): boolean {
  return variant.reserved === 0;
}

// ── Imágenes (RF-26: archivos permitidos) ────────────────────────────────────

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Formato no permitido: usa una imagen JPG, PNG o WebP.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return "El archivo está vacío.";
  if (file.size > IMAGE_MAX_BYTES) return "La imagen pesa más de 2 MB. Usa una más liviana.";
  return null;
}

/** El texto alternativo es obligatorio y describe la foto (RNF-09). */
export function validateImageAlt(alt: string): string | null {
  const value = alt.trim();
  if (value === "") return "Describe la imagen para quien no puede verla.";
  if (value.length > IMAGE_ALT_MAX) {
    return `La descripción admite como máximo ${IMAGE_ALT_MAX} caracteres.`;
  }
  return null;
}

// ── Categorías ───────────────────────────────────────────────────────────────

/** "Montessori y Pikler" → "montessori-y-pikler". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Para comparar nombres sin mayúsculas, tildes ni espacios de más. */
function nameKey(name: string): string {
  return slugify(name);
}

/**
 * Nombre de categoría obligatorio, y nombre y slug únicos. Al editar, el slug no
 * cambia (no rompe enlaces), así que solo se compara el nombre con las demás.
 */
export function validateCategoryName(
  name: string,
  existing: readonly AdminCategory[],
  editingSlug: string | null,
): string | null {
  const value = name.trim();
  if (value === "") return "Escribe el nombre de la categoría.";
  if (value.length > CATEGORY_NAME_MAX) {
    return `El nombre admite como máximo ${CATEGORY_NAME_MAX} caracteres.`;
  }
  if (slugify(value) === "") return "Usa al menos una letra o un número en el nombre.";
  const others = existing.filter((c) => c.slug !== editingSlug);
  if (others.some((c) => nameKey(c.name) === nameKey(value))) {
    return "Ya existe una categoría con ese nombre.";
  }
  if (editingSlug === null && others.some((c) => c.slug === slugify(value))) {
    return `Ya existe una categoría con el enlace «${slugify(value)}».`;
  }
  return null;
}

/** Productos que usan la categoría, como principal o adicional. */
export function countProductsInCategory(
  products: readonly Pick<AdminProduct, "categories">[],
  slug: string,
): number {
  return products.filter((p) => p.categories.includes(slug)).length;
}

// ── Producto completo ────────────────────────────────────────────────────────

/** Lo que el formulario entrega para guardar. Las reservas no vienen del formulario. */
export interface ProductDraft {
  name: string;
  category: string;
  categories: readonly string[];
  levels: readonly LevelId[];
  materials: readonly MaterialSlug[];
  description: string;
  dimensions: string;
  optionName: string;
  variants: readonly Omit<AdminVariant, "reserved">[];
  assemblyPrice: number;
  personalizationPrice: number;
  personalizationMaxLength: number;
  active: boolean;
  /** Texto alternativo de las fotos actuales, en orden. */
  imageAlts: readonly string[];
  /** Imagen elegida en el navegador (solo metadatos: no se sube, ver PR-05/LN-12). */
  newImage: { type: string; size: number; alt: string } | null;
}

export interface ProductDraftContext {
  /** SKU de todos los demás productos. */
  otherProductSkus: readonly string[];
  /** Variantes actuales del producto (vacío al crear), con sus reservas. */
  currentVariants: readonly Pick<AdminVariant, "id" | "sku" | "reserved">[];
  /** Categorías que se pueden elegir: las activas más las que el producto ya tenía. */
  allowedCategories: readonly string[];
}

function textRequired(value: string, max: number, empty: string, label: string) {
  const text = value.trim();
  if (text === "") return empty;
  if (text.length > max) return `${label} admite como máximo ${max} caracteres.`;
  return null;
}

/** Valida un producto completo. Devuelve los errores por campo (vacío = válido). */
export function validateProductDraft(
  draft: ProductDraft,
  context: ProductDraftContext,
): FieldErrors {
  const errors: FieldErrors = {};
  const set = (field: string, message: string | null) => {
    if (message && !errors[field]) errors[field] = message;
  };

  // Información
  set(
    "name",
    textRequired(draft.name, PRODUCT_NAME_MAX, "Escribe el nombre del producto.", "El nombre"),
  );
  set(
    "description",
    textRequired(draft.description, DESCRIPTION_MAX, "Escribe la descripción.", "La descripción"),
  );
  if (!context.allowedCategories.includes(draft.category)) {
    set("category", "Elige una categoría activa.");
  }
  if (draft.categories.some((c) => !context.allowedCategories.includes(c))) {
    set("categories", "Una de las categorías adicionales no está activa.");
  }

  // Variantes e inventario
  if (draft.variants.length === 0) set("variants", "Agrega al menos una variante.");
  if (draft.variants.length > 1) {
    set(
      "optionName",
      textRequired(
        draft.optionName,
        OPTION_MAX,
        "Indica qué se elige (p. ej. Tamaño o Color).",
        "El texto",
      ),
    );
  }
  const reservedById = new Map(context.currentVariants.map((v) => [v.id, v.reserved]));
  const options = new Set<string>();
  draft.variants.forEach((variant, index) => {
    const at = (field: string) => `variants.${index}.${field}`;
    set(at("sku"), validateSkuFormat(variant.sku));
    if (draft.variants.length > 1) {
      const option = (variant.option ?? "").trim();
      set(
        at("option"),
        textRequired(option, OPTION_MAX, "Escribe el nombre de la opción.", "La opción"),
      );
      if (option !== "" && options.has(option.toLowerCase())) {
        set(at("option"), "Esa opción ya está en otra variante.");
      }
      options.add(option.toLowerCase());
    }
    set(at("price"), validateClp(variant.price, "El precio"));
    set(at("compareAtPrice"), validateCompareAt(variant.price, variant.compareAtPrice));
    set(at("physical"), validatePhysicalStock(variant.physical, reservedById.get(variant.id) ?? 0));
  });
  for (const index of findDuplicateSkus(
    draft.variants.map((v) => v.sku),
    context.otherProductSkus,
  )) {
    set(`variants.${index}.sku`, "Ese SKU ya existe. Usa un código único.");
  }
  const kept = new Set(draft.variants.map((v) => v.id));
  for (const variant of context.currentVariants) {
    if (!kept.has(variant.id) && !canRemoveVariant(variant)) {
      set("variants", `La variante ${variant.sku} tiene unidades reservadas y no se puede quitar.`);
    }
  }

  // Extras
  set("assemblyPrice", validateClp(draft.assemblyPrice, "El armado"));
  set("personalizationPrice", validateClp(draft.personalizationPrice, "La personalización"));
  const limit = draft.personalizationMaxLength;
  if (
    !Number.isInteger(limit) ||
    limit < PERSONALIZATION_LIMIT.min ||
    limit > PERSONALIZATION_LIMIT.max
  ) {
    set(
      "personalizationMaxLength",
      `El límite debe ser un entero entre ${PERSONALIZATION_LIMIT.min} y ${PERSONALIZATION_LIMIT.max}.`,
    );
  }

  // Imágenes
  draft.imageAlts.forEach((alt, index) => set(`images.${index}.alt`, validateImageAlt(alt)));
  if (draft.newImage) {
    set("newImage", validateImageFile(draft.newImage));
    set("newImage.alt", validateImageAlt(draft.newImage.alt));
  }

  return errors;
}

/** Precio que se muestra en el listado: el menor entre las variantes. */
export function lowestPrice(product: Pick<AdminProduct, "variants">): number | null {
  if (product.variants.length === 0) return null;
  return Math.min(...product.variants.map((v) => v.price));
}

/** Unidades disponibles sumando todas las variantes. */
export function totalAvailable(product: Pick<AdminProduct, "variants">): number {
  return product.variants.reduce((sum, v) => sum + availableStock(v), 0);
}
