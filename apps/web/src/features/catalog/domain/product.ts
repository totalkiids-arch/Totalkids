/**
 * Producto del catálogo tal como lo muestra la tienda. Dominio puro.
 * Los precios son pesos chilenos (CLP) enteros; null mientras el cliente no los entregue (CL-01).
 */

export const CATEGORIES = [
  { slug: "mesas-y-sillas", label: "Mesas y Sillas" },
  { slug: "camas-y-cunas", label: "Camas y Cunas" },
  { slug: "libreros-y-estantes", label: "Libreros y Estantes" },
  { slug: "organizadores-y-baules", label: "Organizadores y Baúles" },
  { slug: "escritorios", label: "Escritorios" },
  { slug: "linea-montessori", label: "Línea Montessori" },
  { slug: "jardines-y-colegios", label: "Jardines y Colegios" },
] as const;
export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

/** Tramos de edad del filtro, en años (max null = sin tope). */
export const AGE_BUCKETS = [
  { id: "0-2", label: "0 a 2 años", min: 0, max: 2 },
  { id: "3-5", label: "3 a 5 años", min: 3, max: 5 },
  { id: "6-9", label: "6 a 9 años", min: 6, max: 9 },
  { id: "10", label: "10 años o más", min: 10, max: null },
] as const;
export type AgeBucketId = (typeof AGE_BUCKETS)[number]["id"];

export const COLORS = [
  { slug: "natural", label: "Natural madera" },
  { slug: "blanco", label: "Blanco" },
  { slug: "azul", label: "Azul" },
  { slug: "rojo", label: "Rojo" },
  { slug: "amarillo", label: "Amarillo" },
  { slug: "verde", label: "Verde" },
  { slug: "lila", label: "Lila" },
] as const;
export type ColorSlug = (typeof COLORS)[number]["slug"];

export const MATERIALS = [
  { slug: "madera", label: "Madera" },
  { slug: "mdf", label: "MDF lacado" },
  { slug: "plastico", label: "Plástico resistente" },
] as const;
export type MaterialSlug = (typeof MATERIALS)[number]["slug"];

export type ProductRoom = "dormitorio" | "estudio" | "juego-orden";

export type ProductBadgeTone = "sale" | "line" | "new" | "top";

export type ProductIllustrationKey =
  | "mesa-sillas"
  | "librero"
  | "cama-casita"
  | "baul"
  | "escritorio"
  | "organizador"
  | "atril"
  | "torre";

/** Fondo de la ilustración provisional (token de color). */
export type IllustrationTint = "cream" | "soft-blue" | "soft-green" | "soft-purple" | "soft-red";

export interface ProductSummary {
  slug: string;
  name: string;
  /** Categoría principal, para mostrar. */
  category: string;
  categories: readonly CategorySlug[];
  /** Texto de edad para mostrar ("3 a 6 años"). */
  ageRange: string;
  /** Edad recomendada en años; max null = sin tope. */
  ages: { min: number; max: number | null };
  summary: string;
  price: number | null;
  /** Precio anterior, solo si el producto está en oferta. */
  compareAtPrice: number | null;
  badge: { label: string; tone: ProductBadgeTone } | null;
  room: ProductRoom;
  colors: readonly ColorSlug[];
  materials: readonly MaterialSlug[];
  /** Mayor = más vendido. Ordena "Más vendidos". */
  popularity: number;
  /** Fecha ISO de publicación. Ordena "Novedades". */
  publishedAt: string;
  featured: boolean;
  /** Ilustración provisional hasta tener fotos reales. */
  illustration: { key: ProductIllustrationKey; tint: IllustrationTint; alt: string };
}

export const ROOM_LABEL: Record<ProductRoom, string> = {
  dormitorio: "Dormitorio",
  estudio: "Estudio",
  "juego-orden": "Juego y orden",
};

export function isOnSale(product: Pick<ProductSummary, "badge">): boolean {
  return product.badge?.tone === "sale";
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
