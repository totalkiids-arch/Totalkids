import type { CartLine } from "../domain/cart";

/** Lo que el carrito necesita saber de un producto, ya resuelto a una variante (SKU). */
export interface CartProduct {
  slug: string;
  name: string;
  image: { src: string; width: number; height: number; alt: string } | null;
  sku: string;
  /** Nombre de la variante ("1 plaza"); null si el producto no tiene variantes. */
  option: string | null;
  price: number | null;
  compareAtPrice: number | null;
  /** Stock disponible (físico − reservado). */
  available: number;
  extras: readonly {
    id: string;
    label: string;
    price: number | null;
    personalization: { label: string; maxLength: number } | null;
  }[];
}

/** Puerto: consulta del catálogo vigente. null = el producto o la variante ya no se vende. */
export interface CartCatalog {
  findVariant(slug: string, sku: string): Promise<CartProduct | null>;
}

/**
 * Puerto: dónde se guarda el carrito del comprador. Hoy, una cookie con las
 * líneas; con la API, una cookie opaca y las líneas en la base de datos (RF-05).
 */
export interface CartStore {
  read(): Promise<CartLine[]>;
  write(lines: readonly CartLine[]): Promise<void>;
}
