/**
 * Producto del catálogo tal como lo muestra la tienda. Dominio puro.
 * Los precios son pesos chilenos (CLP) enteros; null mientras no estén definidos.
 * Categorías y niveles siguen el catálogo del cliente (totalmuebles.cl).
 */

export const CATEGORIES = [
  { slug: "cunas", label: "Cunas y camas" },
  { slug: "mesas", label: "Mesas" },
  { slug: "sillas", label: "Sillas" },
  { slug: "mudadores", label: "Mudadores" },
  { slug: "almacenamiento", label: "Almacenamiento" },
  { slug: "montessori-pikler", label: "Montessori y Pikler" },
  { slug: "junji", label: "Línea JUNJI" },
] as const;
export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

/** Niveles educativos (JUNJI) para los que se recomienda el mueble. */
export const LEVELS = [
  { id: "sala-cuna", label: "Sala cuna", detail: "0 a 2 años" },
  { id: "nivel-medio", label: "Nivel medio", detail: "2 a 4 años" },
  { id: "transicion", label: "Transición", detail: "4 a 6 años" },
  { id: "adultos", label: "Educadoras y adultos", detail: "Mobiliario docente" },
] as const;
export type LevelId = (typeof LEVELS)[number]["id"];

export const MATERIALS = [
  { slug: "madera", label: "Madera" },
  { slug: "melamina", label: "Melamina" },
  { slug: "plastico", label: "Plástico" },
  { slug: "metal", label: "Metal" },
] as const;
export type MaterialSlug = (typeof MATERIALS)[number]["slug"];

export type ProductBadgeTone = "sale" | "line" | "new" | "top";

export interface ProductImage {
  /** Ruta pública (p. ej. "/productos/cuna-alta-junji/1.webp"). */
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface ProductSummary {
  slug: string;
  name: string;
  /** Categoría principal, para mostrar. */
  category: string;
  categories: readonly CategorySlug[];
  levels: readonly LevelId[];
  summary: string;
  price: number | null;
  /** Precio anterior, solo si el producto está en oferta. */
  compareAtPrice: number | null;
  badge: { label: string; tone: ProductBadgeTone } | null;
  materials: readonly MaterialSlug[];
  /** Mayor = más vendido. Ordena "Más vendidos". */
  popularity: number;
  /** Fecha ISO de publicación. Ordena "Novedades". */
  publishedAt: string;
  featured: boolean;
  /** Foto principal; null si el producto aún no tiene fotos. */
  image: ProductImage | null;
}

export function isOnSale(product: Pick<ProductSummary, "badge">): boolean {
  return product.badge?.tone === "sale";
}

/** "Sala cuna · Nivel medio". Vacío si el producto no indica nivel. */
export function levelsLabel(levels: readonly LevelId[]): string {
  return LEVELS.filter((l) => levels.includes(l.id))
    .map((l) => l.label)
    .join(" · ");
}

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** "$129.990". Sin precio definido devuelve el marcador de la maqueta. */
export function formatClp(amount: number | null): string {
  return amount === null ? "$[PRECIO]" : CLP.format(amount);
}
