/**
 * Producto del catálogo tal como lo muestra la tienda. Dominio puro.
 * Los precios son pesos chilenos (CLP) enteros; null mientras el cliente no los entregue (CL-01).
 */
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

export interface ProductSummary {
  slug: string;
  name: string;
  category: string;
  ageRange: string;
  summary: string;
  price: number | null;
  /** Precio anterior, solo si el producto está en oferta. */
  compareAtPrice: number | null;
  badge: { label: string; tone: ProductBadgeTone } | null;
  room: ProductRoom;
  /** Ilustración provisional hasta tener fotos reales. */
  illustration: { key: ProductIllustrationKey; alt: string };
}

export const ROOM_LABEL: Record<ProductRoom, string> = {
  dormitorio: "Dormitorio",
  estudio: "Estudio",
  "juego-orden": "Juego y orden",
};

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** "$129.990". Sin precio definido devuelve el marcador de la maqueta. */
export function formatClp(amount: number | null): string {
  return amount === null ? "$[PRECIO]" : CLP.format(amount);
}
