import { Prisma } from "../generated/prisma/client.js";
import { pageMeta, pageWindow, type PageMeta, type Pagination } from "../lib/pagination.js";
import type { PrismaClient } from "../lib/prisma.js";

/**
 * Catálogo público (LN-05, RF-01 a RF-03). Solo muestra productos activos y ya
 * publicados, de categorías activas y con al menos una variante activa.
 *
 * - Precio del producto: el menor entre sus variantes activas con precio.
 * - Disponibilidad (UI-11): `en_stock` si alguna variante tiene unidades
 *   (físico − reservado > 0); si no, `a_pedido` (se fabrica y se compra como reserva).
 * - Más vendidos: unidades de pedidos con pago confirmado (confirmado en adelante).
 * - Búsqueda sin tildes ni mayúsculas, por palabras: todas deben aparecer en el
 *   nombre, el resumen o la categoría.
 */

export const SORTS = ["best_selling", "price_asc", "price_desc", "newest"] as const;
export type CatalogSort = (typeof SORTS)[number];

export const AVAILABILITY = ["en_stock", "a_pedido"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export interface CatalogFilters extends Pagination {
  q?: string | undefined;
  category?: string | undefined;
  ageGroups?: string[] | undefined;
  materials?: string[] | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  onSale?: boolean | undefined;
  availability?: Availability | undefined;
  sort: CatalogSort;
}

export interface ImageDto {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface ProductSummaryDto {
  slug: string;
  name: string;
  summary: string | null;
  category: { slug: string; name: string };
  ageGroups: string[];
  materials: string[];
  /** Menor precio entre las variantes; null mientras no esté definido. */
  price: number | null;
  /** Precio anterior de la variante más barata, si está en oferta. */
  compareAtPrice: number | null;
  onSale: boolean;
  featured: boolean;
  availability: Availability;
  publishedAt: string;
  image: ImageDto | null;
}

export interface VariantDto {
  sku: string;
  optionLabel: string | null;
  color: string | null;
  size: string | null;
  price: number | null;
  compareAtPrice: number | null;
  /** Unidades disponibles = físico − reservado (RN-03). 0 = a pedido. */
  available: number;
  availability: Availability;
}

export interface ExtraDto {
  code: string;
  name: string;
  /** null = precio por confirmar (no suma al total). */
  price: number | null;
  personalization: { label: string; maxLength: number } | null;
}

export interface ProductDetailDto extends ProductSummaryDto {
  description: string;
  dimensions: string | null;
  specs: unknown;
  images: (ImageDto & { variantSku: string | null })[];
  variants: VariantDto[];
  extras: ExtraDto[];
}

export interface CategoryDto {
  slug: string;
  name: string;
  description: string | null;
  /** Productos visibles en la tienda. */
  productCount: number;
}

type Db = Pick<PrismaClient, "$queryRaw" | "product" | "category">;

/** Estados de pedido con el pago confirmado: cuentan para "más vendidos". */
const SOLD_STATUSES = Prisma.sql`('confirmed', 'preparing', 'shipped', 'delivered')`;

/** Escapa los comodines de LIKE en lo que escribe el comprador. */
function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Palabras de la búsqueda (máximo 8), sin vacíos. */
export function searchWords(q: string | undefined): string[] {
  return (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
}

/** FROM + WHERE compartido por la página y el conteo. Todo va parametrizado (RNF-04). */
function fromWhere(filters: CatalogFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."status" = 'active'`,
    Prisma.sql`p."published_at" <= now()`,
    Prisma.sql`c."active"`,
  ];
  if (filters.category) conditions.push(Prisma.sql`c."slug" = ${filters.category}`);
  if (filters.ageGroups?.length) {
    conditions.push(Prisma.sql`p."age_groups" && ${filters.ageGroups}::text[]`);
  }
  if (filters.materials?.length) {
    conditions.push(Prisma.sql`p."materials" && ${filters.materials}::text[]`);
  }
  if (filters.priceMin !== undefined) {
    conditions.push(Prisma.sql`vs."min_price" >= ${filters.priceMin}`);
  }
  if (filters.priceMax !== undefined) {
    conditions.push(Prisma.sql`vs."min_price" <= ${filters.priceMax}`);
  }
  if (filters.onSale) conditions.push(Prisma.sql`vs."on_sale"`);
  if (filters.availability) {
    conditions.push(Prisma.sql`vs."in_stock" = ${filters.availability === "en_stock"}`);
  }
  for (const word of searchWords(filters.q)) {
    conditions.push(Prisma.sql`tk_search_normalize(
        p."name" || ' ' || coalesce(p."summary", '') || ' ' || c."name"
      ) LIKE tk_search_normalize(${likePattern(word)}) ESCAPE '\\'`);
  }

  return Prisma.sql`
    FROM "products" p
    JOIN "categories" c ON c."id" = p."category_id"
    JOIN (
      SELECT "product_id",
             min("price") AS "min_price",
             bool_or("compare_at_price" IS NOT NULL) AS "on_sale",
             bool_or("stock_physical" - "stock_reserved" > 0) AS "in_stock"
      FROM "product_variants"
      WHERE "active"
      GROUP BY "product_id"
    ) vs ON vs."product_id" = p."id"
    LEFT JOIN (
      SELECT v."product_id", sum(oi."quantity") AS "sold"
      FROM "order_items" oi
      JOIN "orders" o ON o."id" = oi."order_id"
      JOIN "product_variants" v ON v."id" = oi."variant_id"
      WHERE o."status" IN ${SOLD_STATUSES}
      GROUP BY v."product_id"
    ) s ON s."product_id" = p."id"
    WHERE ${Prisma.join(conditions, " AND ")}`;
}

const ORDER_BY: Record<CatalogSort, Prisma.Sql> = {
  best_selling: Prisma.sql`coalesce(s."sold", 0) DESC, p."featured" DESC, p."published_at" DESC`,
  price_asc: Prisma.sql`vs."min_price" ASC NULLS LAST`,
  price_desc: Prisma.sql`vs."min_price" DESC NULLS LAST`,
  newest: Prisma.sql`p."published_at" DESC`,
};

const summaryInclude = {
  category: true,
  images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1 },
  variants: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { sku: "asc" }] },
} satisfies Prisma.ProductInclude;

type SummaryRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>;

const available = (v: { stockPhysical: number; stockReserved: number }) =>
  Math.max(0, v.stockPhysical - v.stockReserved);

function toImage(image: {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}): ImageDto {
  return { url: image.url, alt: image.alt, width: image.width, height: image.height };
}

function toSummary(product: SummaryRow): ProductSummaryDto {
  const priced = product.variants
    .filter((v) => v.price !== null)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  const cheapest = priced[0];
  const first = product.images[0];
  return {
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    category: { slug: product.category.slug, name: product.category.name },
    ageGroups: product.ageGroups,
    materials: product.materials,
    price: cheapest?.price ?? null,
    compareAtPrice: cheapest?.compareAtPrice ?? null,
    onSale: product.variants.some((v) => v.compareAtPrice !== null),
    featured: product.featured,
    availability: product.variants.some((v) => available(v) > 0) ? "en_stock" : "a_pedido",
    publishedAt: (product.publishedAt ?? product.createdAt).toISOString(),
    image: first ? toImage(first) : null,
  };
}

/** Página del catálogo con búsqueda, filtros y orden. */
export async function listProducts(
  db: Db,
  filters: CatalogFilters,
): Promise<{ items: ProductSummaryDto[]; meta: PageMeta }> {
  const where = fromWhere(filters);
  const { skip, take } = pageWindow(filters);

  const [countRows, idRows] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS "total" ${where}`,
    db.$queryRaw<{ id: string }[]>`
      SELECT p."id" ${where}
      ORDER BY ${ORDER_BY[filters.sort]}, p."id"
      LIMIT ${take} OFFSET ${skip}`,
  ]);
  const total = Number(countRows[0]?.total ?? 0);
  const ids = idRows.map((row) => row.id);

  const products = ids.length
    ? await db.product.findMany({ where: { id: { in: ids } }, include: summaryInclude })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = ids.flatMap((id) => {
    const product = byId.get(id);
    return product ? [toSummary(product)] : [];
  });

  return { items, meta: pageMeta(total, filters) };
}

/** Condición de producto visible en la tienda, para las consultas con Prisma. */
function visibleProduct(now = new Date()): Prisma.ProductWhereInput {
  return {
    status: "active",
    publishedAt: { lte: now },
    category: { active: true },
    variants: { some: { active: true } },
  };
}

/** Ficha de producto, o null si no existe o no está visible. */
export async function getProduct(db: Db, slug: string): Promise<ProductDetailDto | null> {
  const product = await db.product.findFirst({
    where: { slug, ...visibleProduct() },
    include: {
      category: true,
      images: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { variant: { select: { sku: true } } },
      },
      variants: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { sku: "asc" }] },
      extras: {
        where: { extra: { available: true } },
        orderBy: { sortOrder: "asc" },
        include: { extra: true },
      },
    },
  });
  if (!product) return null;

  return {
    ...toSummary({ ...product, images: product.images.slice(0, 1) }),
    description: product.description,
    dimensions: product.dimensions,
    specs: product.specs,
    images: product.images.map((image) => ({
      ...toImage(image),
      variantSku: image.variant?.sku ?? null,
    })),
    variants: product.variants.map((v) => ({
      sku: v.sku,
      optionLabel: v.optionLabel,
      color: v.color,
      size: v.size,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      available: available(v),
      availability: available(v) > 0 ? "en_stock" : "a_pedido",
    })),
    extras: product.extras.map(({ extra }) => ({
      code: extra.code,
      name: extra.name,
      price: extra.price,
      personalization: extra.requiresText
        ? { label: extra.textLabel ?? "Texto", maxLength: extra.textMaxLength ?? 40 }
        : null,
    })),
  };
}

/** Categorías activas con la cantidad de productos visibles, en el orden del panel. */
export async function listCategories(db: Db): Promise<CategoryDto[]> {
  const categories = await db.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { products: { where: visibleProduct() } } },
    },
  });
  return categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    description: c.description,
    productCount: c._count.products,
  }));
}
