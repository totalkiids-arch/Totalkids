import type { CheckoutDetails, Delivery } from "../domain/checkout-details";
import type { CheckoutValues } from "../domain/checkout-draft";
import type { ShippingQuote } from "../domain/shipping";

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
  /** Antes del descuento del cupón. */
  subtotal: number;
  /** Descuento del cupón vigente (0 sin cupón). */
  discount: number;
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

/** Entrega cotizada por la API con el carrito vigente (GET /shipping/quote). */
export interface DeliveryQuote {
  shipping: ShippingQuote;
  /** Totales que se cobrarán: el despacho por confirmar no suma. */
  totals: { subtotal: number; discount: number; shipping: number | null; total: number };
}

/** Por qué no se creó el pedido (409/422 de POST /orders). */
export type PlaceOrderFailure =
  /** El carrito cambió, quedó vacío o con algo sin precio: hay que revisarlo. */
  | "cart"
  /** La API rechazó los datos del comprador: volver a "Datos y facturación". */
  | "details"
  /** El total de hoy no es el que vio el comprador. */
  | "total_changed"
  /** La misma clave se usó con otros datos: se necesita una clave nueva. */
  | "idempotency_mismatch"
  /** Otra petición con la misma clave sigue en curso. */
  | "in_progress"
  | "pickup_disabled"
  | "unavailable";

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; accessToken: string }
  | { ok: false; reason: PlaceOrderFailure; message: string };

/** Por qué no se pudo abrir el pago (409 de POST /payments/flow/create). */
export type StartPaymentFailure =
  /** Hay un intento que podría cobrarse: esperar, no reintentar. */
  | "uncertain"
  | "already_paid"
  /** El pedido venció o ya no se puede pagar: se necesita uno nuevo. */
  | "not_payable"
  | "stock_unavailable"
  | "not_found"
  | "unavailable";

export type StartPaymentResult =
  { ok: true; redirectUrl: string } | { ok: false; reason: StartPaymentFailure; message: string };

/** Puerto: pedido y pago en la API (LN-09, LN-10), con el carrito de este navegador. */
export interface CheckoutGateway {
  /** null si el método no está disponible (retiro deshabilitado). */
  quote(delivery: Delivery): Promise<DeliveryQuote | null>;
  placeOrder(
    details: CheckoutDetails,
    expectedTotal: number,
    idempotencyKey: string,
  ): Promise<PlaceOrderResult>;
  startPayment(orderNumber: string, accessToken: string): Promise<StartPaymentResult>;
}

/**
 * Puerto: clave idempotente del pedido en curso (Idempotency-Key). Se conserva
 * entre envíos: un doble clic o volver desde Flow reutiliza el mismo pedido.
 */
export interface OrderAttemptStore {
  /** La clave vigente; crea una si no hay. */
  current(): Promise<string>;
  /** Descarta la vigente y entrega una nueva (datos distintos o pedido vencido). */
  rotate(): Promise<string>;
}

/** La API del checkout no respondió o respondió algo inesperado. */
export class CheckoutUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("El checkout no está disponible", { cause });
    this.name = "CheckoutUnavailableError";
  }
}
