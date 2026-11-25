import { z } from "zod";

import {
  PAGE_SIZE,
  type CatalogPage,
  type CatalogQuery,
  type SortId,
} from "../domain/catalog-query";
import {
  CATEGORIES,
  LEVELS,
  MATERIALS,
  type CategorySlug,
  type LevelId,
  type MaterialSlug,
  type ProductImage,
  type ProductSummary,
} from "../domain/product";
import { discountPercent, type ProductDetail, type ProductMeasure } from "../domain/product-detail";
import { CARE, CATEGORY_STORY, productHighlight, STORE_LEAD_TIME } from "../domain/store-content";

/*
 * Traducción entre el catálogo público de la API (LN-05, apps/api/openapi.yaml)
 * y el dominio de la tienda. Puro (sin server-only ni Next.js) para poder
 * probarlo. Un cuerpo inesperado lanza: nunca se inventan precios ni productos.
 */

const nullableInt = z.number().int().nullable();

const ApiImage = z.object({
  url: z.string(),
  alt: z.string(),
  width: nullableInt,
  height: nullableInt,
});

const ApiSummary = z.object({
  slug: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  category: z.object({ slug: z.string(), name: z.string() }),
  categories: z.array(z.string()),
  ageGroups: z.array(z.string()),
  materials: z.array(z.string()),
  price: nullableInt,
  compareAtPrice: nullableInt,
  featured: z.boolean(),
  availability: z.enum(["en_stock", "a_pedido"]),
  publishedAt: z.string(),
  image: ApiImage.nullable(),
});

export const ApiProductPage = z.object({
  items: z.array(ApiSummary),
  meta: z.object({
    page: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export type ApiProductPage = z.infer<typeof ApiProductPage>;

export const ApiProductDetail = ApiSummary.extend({
  description: z.string(),
  dimensions: z.string().nullable(),
  optionName: z.string().nullable(),
  leadTime: z.string().nullable(),
  specs: z.unknown(),
  images: z.array(ApiImage),
  variants: z
    .array(
      z.object({
        sku: z.string(),
        optionLabel: z.string().nullable(),
        price: nullableInt,
        compareAtPrice: nullableInt,
        available: z.number().int(),
      }),
    )
    .min(1),
  extras: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      price: nullableInt,
      personalization: z.object({ label: z.string(), maxLength: z.number().int() }).nullable(),
    }),
  ),
});

// ── Consulta ──────────────────────────────────────────────────────────────────

const API_SORT: Record<SortId, string> = {
  "mas-vendidos": "best_selling",
  "menor-precio": "price_asc",
  "mayor-precio": "price_desc",
  novedades: "newest",
};

/** Query string de GET /products para una consulta de la tienda. */
export function toApiSearch(query: CatalogQuery, page = query.page): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  query.levels.forEach((level) => params.append("ageGroup", level));
  query.materials.forEach((material) => params.append("material", material));
  if (query.priceMin !== null) params.set("priceMin", String(query.priceMin));
  if (query.priceMax !== null) params.set("priceMax", String(query.priceMax));
  if (query.onSale) params.set("onSale", "true");
  params.set("sort", API_SORT[query.sort]);
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));
  return params.toString();
}

// ── Respuesta ─────────────────────────────────────────────────────────────────

/** Tamaño por defecto de una foto sin medidas registradas (el layout no salta igual). */
const DEFAULT_IMAGE_SIZE = 1000;

function toImage(image: z.infer<typeof ApiImage>): ProductImage {
  return {
    src: image.url,
    alt: image.alt,
    width: image.width ?? DEFAULT_IMAGE_SIZE,
    height: image.height ?? DEFAULT_IMAGE_SIZE,
  };
}

const known = <T extends string>(values: readonly string[], allowed: readonly T[]): T[] =>
  values.filter((v): v is T => (allowed as readonly string[]).includes(v));

const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);
const LEVEL_IDS = LEVELS.map((l) => l.id);
const MATERIAL_SLUGS = MATERIALS.map((m) => m.slug);

export function toSummary(item: z.infer<typeof ApiSummary>): ProductSummary {
  const percent = discountPercent(item.price, item.compareAtPrice);
  const categories = known<CategorySlug>(item.categories, CATEGORY_SLUGS);
  const badge =
    percent !== null
      ? { label: `-${percent}%`, tone: "sale" as const }
      : categories.includes("montessori-pikler")
        ? { label: "Montessori", tone: "line" as const }
        : null;
  return {
    slug: item.slug,
    name: item.name,
    category: item.category.name,
    categories,
    levels: known<LevelId>(item.ageGroups, LEVEL_IDS),
    summary: item.summary ?? "",
    price: item.price,
    compareAtPrice: percent !== null ? item.compareAtPrice : null,
    badge,
    materials: known<MaterialSlug>(item.materials, MATERIAL_SLUGS),
    // El orden por "más vendidos" lo resuelve la API; aquí no se usa.
    popularity: 0,
    publishedAt: item.publishedAt,
    featured: item.featured,
    inStock: item.availability === "en_stock",
    image: item.image ? toImage(item.image) : null,
  };
}

export function toCatalogPage(body: ApiProductPage): CatalogPage {
  return {
    items: body.items.map(toSummary),
    total: body.meta.total,
    page: body.meta.page,
    pageCount: Math.max(1, body.meta.totalPages),
  };
}

/** "Alto: 50 cm · Ancho: 1,0 m" → filas de la tabla de medidas. */
export function parseDimensions(text: string | null): ProductMeasure[] {
  if (!text) return [];
  return text
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(":");
      return colon > 0
        ? { label: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim() }
        : { label: "Medidas", value: part };
    });
}

const Specs = z.array(z.object({ label: z.string(), value: z.string() }));

/** Párrafos de la descripción (la semilla los une con una línea en blanco). */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function toDetail(body: z.infer<typeof ApiProductDetail>): ProductDetail {
  const summary = toSummary(body);
  const description = splitParagraphs(body.description);
  const specs = Specs.safeParse(body.specs).data ?? [];
  const primary = CATEGORY_SLUGS.find((slug) => slug === body.category.slug);
  const story = primary ? CATEGORY_STORY[primary] : null;
  const images = body.images.map(toImage);
  return {
    ...summary,
    image: images[0] ?? summary.image,
    images,
    description,
    specs,
    dimensions: parseDimensions(body.dimensions),
    care: CARE,
    learning: story?.learning ?? [],
    mascotQuote: story?.quote ?? null,
    optionName: body.variants.length > 1 ? body.optionName : null,
    variants: body.variants.map((v) => ({
      sku: v.sku,
      option: body.variants.length > 1 ? (v.optionLabel ?? v.sku) : null,
      price: v.price,
      compareAtPrice: discountPercent(v.price, v.compareAtPrice) !== null ? v.compareAtPrice : null,
      available: v.available,
    })),
    extras: body.extras.map((e) => ({
      id: e.code,
      label: e.name,
      price: e.price,
      personalization: e.personalization
        ? {
            label: e.personalization.label,
            hint: `Máximo ${e.personalization.maxLength} caracteres`,
            maxLength: e.personalization.maxLength,
          }
        : null,
    })),
    installments: null,
    leadTime: body.leadTime ?? STORE_LEAD_TIME,
    warrantyMonths: null,
    highlight: productHighlight([...description, ...specs.map((s) => s.value)].join(" ")),
  };
}

/**
 * "Completa su pieza": de otras categorías, primero los que comparten nivel y
 * en el orden de más vendidos de la lista; uno por categoría.
 */
export function pickRelated(
  all: readonly ProductSummary[],
  slug: string,
  limit: number,
): ProductSummary[] {
  const product = all.find((p) => p.slug === slug);
  if (!product) return [];
  const primary = product.categories[0];
  const sharesLevel = (p: ProductSummary) => p.levels.some((l) => product.levels.includes(l));
  const picked: ProductSummary[] = [];
  const used = new Set<string>();
  const candidates = all
    .filter((p) => p.slug !== slug && p.categories[0] !== primary)
    .map((p, index) => ({ p, index }))
    .sort((a, b) => Number(sharesLevel(b.p)) - Number(sharesLevel(a.p)) || a.index - b.index);
  for (const { p } of candidates) {
    const category = p.categories[0] ?? p.category;
    if (used.has(category)) continue;
    used.add(category);
    picked.push(p);
    if (picked.length === limit) break;
  }
  return picked;
}
