import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import type { InventoryRow } from "../application/admin-catalog";
import type {
  AdminCategory,
  AdminProduct,
  AdminProductListItem,
  ExtraOption,
  FieldErrors,
  InventoryActivity,
  ProductDraft,
  ProductStatus,
} from "../domain/admin-product";
import { PRODUCT_STATUSES } from "../domain/admin-product";

/*
 * Traducción entre la API del catálogo (LN-12, apps/api/openapi.yaml) y el
 * dominio del panel. Puro (sin server-only ni Next.js) para poder probarlo.
 * Un cuerpo inesperado cuenta como API no disponible: nunca se inventan datos.
 */

const nullableInt = z.number().int().nullable();

const ApiCategoryRef = z.object({ id: z.string(), slug: z.string(), name: z.string() });

const ApiVariant = z.object({
  id: z.string(),
  sku: z.string(),
  optionLabel: z.string().nullable(),
  price: nullableInt,
  compareAtPrice: nullableInt,
  stockPhysical: z.number().int(),
  stockReserved: z.number().int(),
  active: z.boolean(),
});

const ApiImage = z.object({
  id: z.string(),
  url: z.string(),
  alt: z.string(),
  width: nullableInt,
  height: nullableInt,
});

const ApiProductExtra = z.object({
  code: z.string(),
  price: nullableInt,
  textMaxLength: nullableInt,
});

const ApiProduct = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  dimensions: z.string().nullable(),
  ageGroups: z.array(z.string()),
  materials: z.array(z.string()),
  optionName: z.string().nullable(),
  status: z.enum(PRODUCT_STATUSES),
  category: ApiCategoryRef,
  additionalCategories: z.array(ApiCategoryRef),
  variants: z.array(ApiVariant),
  images: z.array(ApiImage),
  extras: z.array(ApiProductExtra),
});

const ApiProductSummary = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(PRODUCT_STATUSES),
  category: ApiCategoryRef,
  price: nullableInt,
  variantCount: z.number().int(),
  available: z.number().int(),
});

const ApiPageMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

const ApiCategory = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  active: z.boolean(),
  productCount: z.number().int(),
});

const ApiExtra = z.object({
  code: z.string(),
  name: z.string(),
  price: nullableInt,
  requiresText: z.boolean(),
  textMaxLength: nullableInt,
});

const ApiInventoryRow = z.object({
  variantId: z.string(),
  sku: z.string(),
  optionLabel: z.string().nullable(),
  variantActive: z.boolean(),
  productId: z.string(),
  productName: z.string(),
  productSlug: z.string(),
  stockPhysical: z.number().int(),
  stockReserved: z.number().int(),
});

const ApiActivityItem = z.object({
  id: z.string(),
  at: z.string(),
  description: z.string(),
  reason: z.string().nullable(),
  actorName: z.string().nullable(),
  actorLabel: z.string(),
});

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data;
}

/**
 * Las imágenes subidas se guardan en `${API_URL}/uploads/…`: el panel las pide
 * a `/uploads/…` de Next (rewrite en next.config.ts), así el navegador no habla
 * con la API. Las rutas locales (`/productos/…`) y las de un CDN quedan igual.
 */
export function panelImageSrc(url: string, apiUrl: string): string {
  const prefix = `${apiUrl}/uploads/`;
  return url.startsWith(prefix) ? `/uploads/${url.slice(prefix.length)}` : url;
}

export function toAdminProduct(body: unknown, apiUrl: string): AdminProduct {
  const p = parse(ApiProduct, body);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category.id,
    categories: [p.category.id, ...p.additionalCategories.map((c) => c.id)],
    levels: p.ageGroups,
    materials: p.materials,
    description: p.description,
    dimensions: p.dimensions ?? "",
    optionName: p.optionName,
    // Las inactivas son variantes que se quitaron pero tienen historial.
    variants: p.variants
      .filter((v) => v.active)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        option: v.optionLabel,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        physical: v.stockPhysical,
        reserved: v.stockReserved,
      })),
    extras: p.extras.map((e) => ({ code: e.code, price: e.price, textMaxLength: e.textMaxLength })),
    status: p.status,
    images: p.images.map((image) => ({
      id: image.id,
      src: panelImageSrc(image.url, apiUrl),
      width: image.width,
      height: image.height,
      alt: image.alt,
    })),
  };
}

export function toProductPage(body: unknown): {
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageCount: number;
} {
  const data = parse(z.object({ items: z.array(ApiProductSummary), meta: ApiPageMeta }), body);
  return {
    items: data.items.map((p) => ({
      id: p.id,
      name: p.name,
      categoryName: p.category.name,
      status: p.status,
      variantCount: p.variantCount,
      price: p.price,
      available: p.available,
    })),
    total: data.meta.total,
    page: data.meta.page,
    pageCount: Math.max(1, data.meta.totalPages),
  };
}

export function toCategories(body: unknown): (AdminCategory & { productCount: number })[] {
  return parse(z.object({ items: z.array(ApiCategory) }), body).items.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    active: c.active,
    productCount: c.productCount,
  }));
}

export function toCategory(body: unknown): AdminCategory {
  const c = parse(ApiCategory, body);
  return { id: c.id, slug: c.slug, name: c.name, active: c.active };
}

export function toExtraOptions(body: unknown): ExtraOption[] {
  return parse(z.object({ items: z.array(ApiExtra) }), body).items.map((e) => ({
    code: e.code,
    name: e.name,
    requiresText: e.requiresText,
    price: e.price,
    textMaxLength: e.textMaxLength,
  }));
}

export function toInventoryPage(body: unknown): { rows: InventoryRow[]; totalPages: number } {
  const data = parse(z.object({ items: z.array(ApiInventoryRow), meta: ApiPageMeta }), body);
  return {
    rows: data.items.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      productSlug: r.productSlug,
      variantId: r.variantId,
      sku: r.sku,
      option: r.optionLabel,
      active: r.variantActive,
      physical: r.stockPhysical,
      reserved: r.stockReserved,
    })),
    totalPages: data.meta.totalPages,
  };
}

export function toInventoryActivity(body: unknown): InventoryActivity[] {
  return parse(z.object({ items: z.array(ApiActivityItem) }), body).items.map((a) => ({
    id: a.id,
    at: a.at,
    actor: a.actorName ?? a.actorLabel,
    description: a.description,
    reason: a.reason ?? "",
  }));
}

/** El id del producto creado o editado (respuesta de POST o PATCH). */
export function productIdOf(body: unknown): string {
  return parse(z.object({ id: z.string() }), body).id;
}

// ── Del formulario a la API ─────────────────────────────────────────────────

/** Cuerpo de POST/PATCH /admin/products a partir del borrador del panel. */
export function toApiProductBody(draft: ProductDraft, status: ProductStatus) {
  const multiple = draft.variants.length > 1;
  return {
    name: draft.name,
    description: draft.description,
    dimensions: draft.dimensions || null,
    ageGroups: draft.levels,
    materials: draft.materials,
    optionName: multiple ? draft.optionName : null,
    categoryId: draft.category,
    additionalCategoryIds: draft.categories.filter((c) => c !== draft.category),
    variants: draft.variants.map((v) => ({
      // El stock de una variante existente no se toca aquí (se ajusta con motivo).
      ...(v.id ? { id: v.id } : { stockPhysical: v.physical }),
      sku: v.sku,
      optionLabel: multiple ? v.option : null,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
    })),
    extras: draft.extras
      .filter((e) => e.offered)
      .map((e) => ({
        code: e.code,
        price: e.price,
        ...(e.textMaxLength === null ? {} : { textMaxLength: e.textMaxLength }),
      })),
    status,
  };
}

/** Rutas de la API que se llaman distinto en el formulario del panel. */
const FIELD_ALIASES: Record<string, string> = {
  categoryId: "category",
  additionalCategoryIds: "categories",
  ageGroups: "levels",
  status: "publish",
  images: "newImage",
};

/**
 * Errores por campo de la API → rutas del formulario. `extras.N` en la API es la
 * posición entre los extras ofrecidos; en el formulario, entre todos los extras.
 */
export function toFormErrors(apiErrors: FieldErrors, draft: ProductDraft): FieldErrors {
  const offered = draft.extras.flatMap((extra, index) => (extra.offered ? [index] : []));
  const errors: FieldErrors = {};
  for (const [path, message] of Object.entries(apiErrors)) {
    let key = FIELD_ALIASES[path] ?? path;
    key = key
      .replace(/^variants\.(\d+)\.optionLabel$/, "variants.$1.option")
      .replace(/^variants\.(\d+)\.stockPhysical$/, "variants.$1.physical")
      .replace(/^extras\.(\d+)\./, (_, n: string) => `extras.${offered[Number(n)] ?? n}.`);
    if (!(key in errors)) errors[key] = message;
  }
  return errors;
}
