/**
 * Catálogo tal como lo administra el panel: productos con variantes, stock,
 * extras, imágenes y categorías (RF-26), y el inventario (RF-34).
 * Dominio puro: solo tipos y reglas, sin React, Next.js ni acceso a datos.
 *
 * Los datos viven en la API (LN-12), que vuelve a validar todo y aplica la
 * autorización. Estas reglas solo evitan un viaje con datos que no pasarán y
 * usan los mismos mensajes que la API.
 *
 * Reglas de la SRS que se aplican aquí:
 * - RF-26: SKU único, importes válidos, archivos permitidos; desactivar no borra.
 * - RN-01: importes en CLP, enteros y no negativos.
 * - RN-03: disponible = físico − reservado; un ajuste no deja físico < reservas.
 */
import { LOW_STOCK_THRESHOLD } from "./product-detail";

/** Borrador (nunca publicado), publicado o desactivado. */
export const PRODUCT_STATUSES = ["draft", "active", "inactive"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Borrador",
  active: "Publicado",
  inactive: "Inactivo",
};

export interface AdminVariant {
  id: string;
  sku: string;
  /** Nombre de la opción ("1 plaza", "Azul"); null si el producto tiene una sola variante. */
  option: string | null;
  /** CLP; null = por definir (no se puede publicar). */
  price: number | null;
  /** Precio anterior (oferta); null si no hay. */
  compareAtPrice: number | null;
  /** Unidades en bodega. Se cambia con un ajuste de inventario (con motivo, RF-34). */
  physical: number;
  /** Unidades apartadas por pedidos en curso (RN-03, RN-04). No se editan en el panel. */
  reserved: number;
}

export interface AdminImage {
  id: string;
  src: string;
  /** null si la API no pudo leer el tamaño. */
  width: number | null;
  height: number | null;
  alt: string;
}

/** Extra que la tienda puede ofrecer en un producto (armado, personalización…). */
export interface ExtraOption {
  code: string;
  name: string;
  /** Pide un texto al comprador (p. ej. el nombre a grabar). */
  requiresText: boolean;
  /** Precio general del extra; null = por confirmar. */
  price: number | null;
  textMaxLength: number | null;
}

/** Extra ofrecido en un producto. null en price/textMaxLength = el general del extra. */
export interface ProductExtra {
  code: string;
  price: number | null;
  textMaxLength: number | null;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  /** Id de la categoría principal; siempre está incluida en `categories`. */
  category: string;
  /** Ids de la principal y las adicionales. */
  categories: readonly string[];
  /** Niveles (grupos de edad) y materiales, con los ids de la tienda. */
  levels: readonly string[];
  materials: readonly string[];
  description: string;
  /** Texto libre: "Ancho 1,0 m · Fondo 40 cm · Alto 50 cm". */
  dimensions: string;
  /** Qué se elige entre variantes ("Tamaño", "Color"); null con una sola variante. */
  optionName: string | null;
  /** Solo las variantes activas (las que se quitaron con historial quedan inactivas). */
  variants: readonly AdminVariant[];
  /** Extras ofrecidos en este producto. */
  extras: readonly ProductExtra[];
  status: ProductStatus;
  images: readonly AdminImage[];
}

/** Fila del listado de productos del panel. */
export interface AdminProductListItem {
  id: string;
  name: string;
  categoryName: string;
  status: ProductStatus;
  /** Variantes activas. */
  variantCount: number;
  /** Menor precio entre las variantes activas; null si aún no tiene. */
  price: number | null;
  /** Unidades disponibles de las variantes activas. */
  available: number;
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

/** Ajuste de inventario tal como lo registra el historial (audit_log). */
export interface InventoryActivity {
  id: string;
  /** Fecha ISO. */
  at: string;
  /** Nombre de la persona (o el rol si no hay nombre). */
  actor: string;
  /** "Ajuste de stock TK-12: 0 → 5". */
  description: string;
  reason: string;
}

/** Errores por campo: clave = ruta del campo ("name", "variants.0.sku"), valor = mensaje. */
export type FieldErrors = Record<string, string>;

export const PRODUCT_NAME_MAX = 120;
export const SKU_MAX = 40;
export const OPTION_MAX = 60;
export const DESCRIPTION_MAX = 4000;
export const DIMENSIONS_MAX = 200;
export const STOCK_REASON_MAX = 200;
export const IMAGE_ALT_MAX = 160;
export const CATEGORY_NAME_MAX = 60;
export const TEXT_LIMIT = { min: 1, max: 100 } as const;

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
 * Índices de las variantes cuyo SKU se repite dentro del mismo producto. No
 * distingue mayúsculas ("tk-1" = "TK-1"). Entre productos lo comprueba la API.
 */
export function findDuplicateSkus(skus: readonly string[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  skus.forEach((sku, index) => {
    const key = normalizeSku(sku);
    if (key === "") return;
    if (seen.has(key)) duplicates.push(index);
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
  return stockStatus(availableStock(variant));
}

/** Estado a partir de las unidades disponibles (también para el total de un producto). */
export function stockStatus(available: number): InventoryStatus {
  if (available <= 0) return "out";
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

/** Ajuste de inventario: nuevo físico válido, distinto del actual, y motivo obligatorio (RF-34). */
export function validateStockAdjustment(input: {
  physical: number;
  current: number;
  reserved: number;
  reason: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const physical = validatePhysicalStock(input.physical, input.reserved);
  if (physical) errors.physical = physical;
  else if (input.physical === input.current) {
    errors.physical = `El stock físico ya es ${input.current}: no hay nada que ajustar.`;
  }
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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Nombre de categoría obligatorio y único (sin mayúsculas, tildes ni espacios de
 * más). Al editar, el slug no cambia (no rompe enlaces).
 */
export function validateCategoryName(
  name: string,
  existing: readonly AdminCategory[],
  editingId: string | null,
): string | null {
  const value = name.trim();
  if (value === "") return "Escribe el nombre de la categoría.";
  if (value.length > CATEGORY_NAME_MAX) {
    return `El nombre admite como máximo ${CATEGORY_NAME_MAX} caracteres.`;
  }
  if (slugify(value) === "") return "Usa al menos una letra o un número en el nombre.";
  const others = existing.filter((c) => c.id !== editingId);
  if (others.some((c) => slugify(c.name) === slugify(value))) {
    return "Ya existe una categoría con ese nombre.";
  }
  if (editingId === null && others.some((c) => c.slug === slugify(value))) {
    return `Ya existe una categoría con el enlace «${slugify(value)}».`;
  }
  return null;
}

// ── Producto completo ────────────────────────────────────────────────────────

export interface DraftVariant {
  /** Id de la API, o null si la variante es nueva. */
  id: string | null;
  sku: string;
  option: string | null;
  price: number;
  compareAtPrice: number | null;
  /** Stock inicial: solo se usa en variantes nuevas. */
  physical: number;
}

export interface DraftExtra {
  code: string;
  offered: boolean;
  /** null = el precio general del extra. */
  price: number | null;
  /** null = el límite general del extra. */
  textMaxLength: number | null;
}

/** Lo que el formulario entrega para guardar. Las reservas no vienen del formulario. */
export interface ProductDraft {
  name: string;
  category: string;
  categories: readonly string[];
  levels: readonly string[];
  materials: readonly string[];
  description: string;
  dimensions: string;
  optionName: string;
  variants: readonly DraftVariant[];
  extras: readonly DraftExtra[];
  /** «Visible en el catálogo». */
  publish: boolean;
  /** Texto alternativo de las fotos actuales, en orden. */
  imageAlts: readonly string[];
  /** Imagen nueva elegida (se sube después de guardar). */
  newImage: { type: string; size: number; alt: string } | null;
}

export interface ProductDraftContext {
  /** Variantes actuales del producto (vacío al crear), con sus reservas. */
  currentVariants: readonly Pick<AdminVariant, "id" | "sku" | "reserved">[];
  /** Categorías que se pueden elegir: las activas más las que el producto ya tenía. */
  allowedCategories: readonly string[];
  /** Extras que existen en la tienda. */
  extraOptions: readonly ExtraOption[];
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
  if (draft.dimensions.trim().length > DIMENSIONS_MAX) {
    set("dimensions", `Las medidas admiten como máximo ${DIMENSIONS_MAX} caracteres.`);
  }
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
    // El stock de una variante existente se cambia en Inventario (con motivo).
    if (variant.id === null) set(at("physical"), validatePhysicalStock(variant.physical, 0));
  });
  for (const index of findDuplicateSkus(draft.variants.map((v) => v.sku))) {
    set(`variants.${index}.sku`, "Ese SKU ya existe. Usa un código único.");
  }
  const kept = new Set(draft.variants.map((v) => v.id));
  for (const variant of context.currentVariants) {
    if (!kept.has(variant.id) && !canRemoveVariant(variant)) {
      set("variants", `La variante ${variant.sku} tiene unidades reservadas y no se puede quitar.`);
    }
  }

  // Extras
  draft.extras.forEach((extra, index) => {
    if (!extra.offered) return;
    const option = context.extraOptions.find((o) => o.code === extra.code);
    if (!option) {
      set(`extras.${index}.code`, "Ese extra no existe.");
      return;
    }
    if (extra.price !== null) set(`extras.${index}.price`, validateClp(extra.price, option.name));
    const limit = extra.textMaxLength;
    if (
      option.requiresText &&
      limit !== null &&
      (!Number.isInteger(limit) || limit < TEXT_LIMIT.min || limit > TEXT_LIMIT.max)
    ) {
      set(
        `extras.${index}.textMaxLength`,
        `El límite debe ser un entero entre ${TEXT_LIMIT.min} y ${TEXT_LIMIT.max}.`,
      );
    }
  });

  // Imágenes
  draft.imageAlts.forEach((alt, index) => set(`images.${index}.alt`, validateImageAlt(alt)));
  if (draft.newImage) {
    set("newImage", validateImageFile(draft.newImage));
    set("newImage.alt", validateImageAlt(draft.newImage.alt));
  }

  return errors;
}

/**
 * Estado que se pide al guardar: visible = publicado; si no, un producto que
 * nunca se publicó sigue en borrador y uno publicado pasa a inactivo.
 */
export function requestedStatus(publish: boolean, current: ProductStatus | null): ProductStatus {
  if (publish) return "active";
  return current === null || current === "draft" ? "draft" : "inactive";
}
