/**
 * Pedido visto por el comprador (RF-23, RF-36). Dominio puro.
 *
 * Las líneas son una foto del momento de la compra (nombre, SKU y precio): no
 * cambian si después se edita el catálogo.
 */

export const ORDER_STATUSES = [
  "pending_payment",
  "in_review",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "expired",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Pendiente de pago",
  in_review: "Pago en revisión",
  confirmed: "Confirmado",
  preparing: "En preparación",
  shipped: "Despachado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  expired: "Vencido",
};

export type OrderTone = "success" | "progress" | "waiting" | "closed";

/** Tono de la insignia de estado. */
export function orderTone(status: OrderStatus): OrderTone {
  if (status === "delivered") return "success";
  if (status === "confirmed" || status === "preparing" || status === "shipped") return "progress";
  if (status === "pending_payment" || status === "in_review") return "waiting";
  return "closed";
}

export interface OrderLine {
  name: string;
  sku: string;
  /** Variante o extras elegidos ("Armado incluido"). */
  detail: string | null;
  quantity: number;
  /** Precio unitario al momento de la compra, en CLP. */
  unitPrice: number;
}

export interface OrderEvent {
  /** Fecha y hora ISO. */
  at: string;
  label: string;
}

export interface IssuedInvoice {
  /** Folio de la factura electrónica. */
  number: string;
  /** Fecha y hora ISO del registro. */
  issuedAt: string;
  issuedBy: string;
}

/** Estados con el pago confirmado: desde aquí corresponde emitir la factura. */
const PAID: readonly OrderStatus[] = ["confirmed", "preparing", "shipped", "delivered"];

/**
 * Factura pendiente de emitir: el comprador pidió factura, el pago está
 * confirmado y todavía no se registra el folio. Flow solo cubre la boleta.
 */
export function invoicePending(order: Pick<Order, "document" | "status" | "invoice">): boolean {
  return order.document === "factura" && !order.invoice && PAID.includes(order.status);
}

export interface Order {
  /** Número visible ("TK-1048"). */
  id: string;
  /** Fecha y hora ISO de la compra. */
  createdAt: string;
  email: string;
  buyerName: string;
  status: OrderStatus;
  lines: OrderLine[];
  shipping: number;
  discount: number;
  delivery: { method: "domicilio"; address: string } | { method: "retiro"; address: string };
  /** Boleta = comprobante de pago de Flow. Factura = la emite Total Kids. */
  document: "boleta" | "factura";
  /** Factura ya emitida por Total Kids (folio del SII); null o ausente = aún no. */
  invoice?: IssuedInvoice | null;
  /** Despacho: transportista y código de seguimiento, cuando existen. */
  tracking: { carrier: string; code: string } | null;
  /** Historial, del más antiguo al más reciente. */
  history: OrderEvent[];
}

export function orderSubtotal(order: Pick<Order, "lines">): number {
  return order.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

export function orderTotal(order: Pick<Order, "lines" | "shipping" | "discount">): number {
  return orderSubtotal(order) + order.shipping - order.discount;
}

export function orderUnits(order: Pick<Order, "lines">): number {
  return order.lines.reduce((sum, l) => sum + l.quantity, 0);
}

/** Pasos del seguimiento que ve el comprador (RF-36). */
export const TRACKING_STEPS = ["Recibido", "Pagado", "En preparación", "Despachado", "Entregado"];

/**
 * Cuántos pasos del seguimiento están completos. null cuando el pedido no
 * avanza (cancelado o vencido): en vez de la barra se muestra el estado.
 */
export function trackingProgress(status: OrderStatus): number | null {
  switch (status) {
    case "pending_payment":
    case "in_review":
      return 1;
    case "confirmed":
      return 2;
    case "preparing":
      return 3;
    case "shipped":
      return 4;
    case "delivered":
      return 5;
    case "cancelled":
    case "expired":
      return null;
  }
}

/** Más recientes primero. */
export function sortByNewest(orders: readonly Order[]): Order[] {
  return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
