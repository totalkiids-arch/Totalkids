import { z } from "zod";

/**
 * Semilla del catálogo (DE-03): convierte el catálogo importado de
 * totalmuebles.cl (apps/web/.../totalmuebles/catalogo.json) en filas de la
 * base. Funciones puras: no tocan la base ni el disco.
 */

/** Categorías de la tienda, con los mismos slugs y nombres que usa la web. */
export const SEED_CATEGORIES = [
  { slug: "cunas", name: "Cunas y camas" },
  { slug: "mesas", name: "Mesas" },
  { slug: "sillas", name: "Sillas" },
  { slug: "mudadores", name: "Mudadores" },
  { slug: "almacenamiento", name: "Almacenamiento" },
  { slug: "montessori-pikler", name: "Montessori y Pikler" },
  { slug: "junji", name: "Línea JUNJI" },
] as const;

/**
 * Unidades provisionales cuando el sitio de origen solo dice "con stock" sin
 * cantidad (85 de 88 productos). El cliente las corrige en el panel (inventario).
 */
export const DEFAULT_STOCK_WHEN_UNKNOWN = 10;

const LabelValue = z.object({ label: z.string(), value: z.string() });

export const ImportedProduct = z.object({
  sourceId: z.number().int().positive(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1).max(160),
  category: z.string(),
  levels: z.array(z.string()),
  materials: z.array(z.string()),
  summary: z.string().nullable(),
  description: z.array(z.string()),
  specs: z.array(LabelValue),
  dimensions: z.array(LabelValue),
  price: z.number().int().nonnegative().nullable(),
  compareAtPrice: z.number().int().nonnegative().nullable(),
  available: z.number().int().nonnegative().nullable(),
  inStock: z.boolean(),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  featured: z.boolean(),
  images: z.array(
    z.object({
      src: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      alt: z.string(),
    }),
  ),
});

export type ImportedProduct = z.infer<typeof ImportedProduct>;

export interface SeedProduct {
  slug: string;
  categorySlug: string;
  name: string;
  summary: string | null;
  description: string;
  ageGroups: string[];
  materials: string[];
  dimensions: string | null;
  specs: { label: string; value: string }[];
  featured: boolean;
  publishedAt: Date;
  variant: {
    sku: string;
    price: number | null;
    compareAtPrice: number | null;
    stockPhysical: number;
  };
  images: { url: string; alt: string; width: number; height: number; sortOrder: number }[];
}

const MAX = { summary: 400, dimensions: 200, alt: 200 } as const;

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

/** "Alto: 50 cm · Ancho: 1,0 m" (o null si no hay medidas). */
export function formatDimensions(dimensions: readonly { label: string; value: string }[]) {
  if (dimensions.length === 0) return null;
  return clip(dimensions.map((d) => `${d.label}: ${d.value}`).join(" · "), MAX.dimensions);
}

/** Stock físico inicial: la cantidad informada, o una provisional si solo hay "con stock". */
export function initialStock(product: Pick<ImportedProduct, "available" | "inStock">): number {
  if (!product.inStock) return 0;
  return product.available ?? DEFAULT_STOCK_WHEN_UNKNOWN;
}

/** Convierte un producto importado en las filas que se guardan. */
export function toSeedProduct(product: ImportedProduct): SeedProduct {
  if (!SEED_CATEGORIES.some((c) => c.slug === product.category)) {
    throw new Error(`Categoría desconocida «${product.category}» en ${product.slug}`);
  }
  const compareAtPrice =
    product.price !== null &&
    product.compareAtPrice !== null &&
    product.compareAtPrice > product.price
      ? product.compareAtPrice
      : null;
  return {
    slug: product.slug,
    categorySlug: product.category,
    name: product.name,
    summary: product.summary ? clip(product.summary, MAX.summary) : null,
    description: product.description.join("\n\n"),
    ageGroups: product.levels,
    materials: product.materials,
    dimensions: formatDimensions(product.dimensions),
    specs: product.specs,
    featured: product.featured,
    // Mediodía UTC: la fecha se ve igual en Chile.
    publishedAt: new Date(`${product.publishedAt}T12:00:00Z`),
    variant: {
      sku: `TK-${product.sourceId}`,
      price: product.price,
      compareAtPrice,
      stockPhysical: initialStock(product),
    },
    images: product.images.map((image, index) => ({
      url: image.src,
      alt: clip(image.alt || product.name, MAX.alt),
      width: image.width,
      height: image.height,
      sortOrder: index,
    })),
  };
}

/** Valida el JSON completo y lo convierte; falla con el producto que no calza. */
export function parseCatalog(data: unknown): SeedProduct[] {
  const products = z.array(ImportedProduct).parse(data);
  const skus = new Set<number>();
  for (const p of products) {
    if (skus.has(p.sourceId)) throw new Error(`Producto repetido: ${p.sourceId} (${p.slug})`);
    skus.add(p.sourceId);
  }
  return products.map(toSeedProduct);
}
