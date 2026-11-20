// Raíz de composición de "orders": conecta los puertos con sus adaptadores actuales.
import type { GuestAccessStore, OrderRepository, ViewerSession } from "./application/ports";
import {
  canViewOrder,
  LOOKUP_NOT_FOUND,
  normalizeOrderId,
  parseGuestLookup,
} from "./domain/guest-lookup";
import { sortByNewest, type Order } from "./domain/order";
import { authViewerSession } from "./infrastructure/auth-viewer-session";
import { cookieGuestAccessStore } from "./infrastructure/cookie-guest-access-store";
import { demoOrderRepository } from "./infrastructure/demo-orders";

const orders: OrderRepository = demoOrderRepository;
const session: ViewerSession = authViewerSession;
const guestAccess: GuestAccessStore = cookieGuestAccessStore;

/**
 * Caso de uso: historial propio (RF-23). Solo los pedidos del comprador con
 * sesión iniciada; null si no hay sesión (la pantalla lleva a ingresar).
 */
export async function getMyOrders(): Promise<{
  buyer: { name: string; email: string };
  orders: Order[];
} | null> {
  const buyer = await session.currentBuyer();
  if (!buyer) return null;
  return { buyer, orders: sortByNewest(await orders.listByEmail(buyer.email)) };
}

/**
 * Caso de uso: detalle y seguimiento (RF-23, RF-36). Lo ve el dueño con sesión
 * o quien lo consultó como invitado. Si no existe o no le corresponde, la
 * respuesta es la misma (null): no se revela qué pedidos existen.
 */
export async function getOrderForViewer(
  id: string,
): Promise<{ order: Order; viewer: "owner" | "guest" } | null> {
  const orderId = normalizeOrderId(id);
  if (!orderId) return null;
  const [order, buyer, guestOrderIds] = await Promise.all([
    orders.findById(orderId),
    session.currentBuyer(),
    guestAccess.read(),
  ]);
  if (!order) return null;
  const sessionEmail = buyer?.email ?? null;
  if (!canViewOrder(order, { sessionEmail, guestOrderIds })) return null;
  return { order, viewer: sessionEmail === order.email ? "owner" : "guest" };
}

export type GuestLookupResult =
  | { ok: true; orderId: string }
  | { ok: false; errors: { pedido?: string; correo?: string }; message: string | null };

/** Caso de uso: consultar un pedido sin cuenta, con número y correo (RF-36). */
export async function lookupGuestOrder(
  input: Partial<Record<string, unknown>>,
): Promise<GuestLookupResult> {
  const parsed = parseGuestLookup(input);
  if (!parsed.ok) return { ...parsed, message: null };
  const order = await orders.findById(parsed.orderId);
  if (!order || order.email !== parsed.email) {
    return { ok: false, errors: {}, message: LOOKUP_NOT_FOUND };
  }
  await guestAccess.grant(order.id);
  return { ok: true, orderId: order.id };
}
