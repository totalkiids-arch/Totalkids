import type { CheckoutValues } from "../domain/checkout-draft";

/** Una línea del carrito tal como la necesita el resumen del checkout. */
export interface CheckoutCartLine {
  id: string;
  name: string;
  /** Variante y extras elegidos, para mostrar bajo el nombre ("1 plaza · Armado"). */
  detail: string | null;
  quantity: number;
  /** Total de la línea; null si su precio falta definir. */
  total: number | null;
}

/** Carrito ya revalidado contra el catálogo (lo calcula la feature "cart"). */
export interface CheckoutCart {
  lines: CheckoutCartLine[];
  subtotal: number;
  /** Productos o servicios sin precio definido: no entran al subtotal. */
  unpriced: string[];
  /** Hay líneas agotadas: hay que volver al carrito antes de pagar. */
  blocked: boolean;
}

/** Puerto: el carrito vigente del comprador. */
export interface CheckoutCartReader {
  read(): Promise<CheckoutCart>;
}

/**
 * Puerto: dónde se guarda el borrador de "Datos y facturación" entre pasos.
 * Hoy, una cookie httpOnly; con la API, el pedido en estado "creado".
 */
export interface CheckoutDraftStore {
  read(): Promise<CheckoutValues>;
  write(values: CheckoutValues): Promise<void>;
  clear(): Promise<void>;
}
