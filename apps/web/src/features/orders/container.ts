// Raíz de composición de "orders": conecta los puertos con sus adaptadores actuales.
import type { PaymentAttemptRow } from "@/features/payments";

import type { AdminOrderPanel } from "./application/admin-order-panel";
import type { GuestAccessStore, OrderRepository, ViewerSession } from "./application/ports";
import {
  applyAdminOrderQuery,
  filterAdminOrders,
  ordersToCsv,
  parseAdminOrderQuery,
  type AdminOrderPage,
  type AdminOrderQuery,
} from "./domain/admin-order-query";
import {
  canViewOrder,
  LOOKUP_NOT_FOUND,
  normalizeOrderId,
  parseGuestLookup,
} from "./domain/guest-lookup";
import { sortByNewest, type Order } from "./domain/order";
import { ordersOverview, type AdminOrderRecord } from "./domain/order-workflow";
import { authViewerSession } from "./infrastructure/auth-viewer-session";
import { cookieGuestAccessStore } from "./infrastructure/cookie-guest-access-store";
import { demoAdminOrderPanel } from "./infrastructure/demo-admin-order-panel";

// DEMO (ver infrastructure/demo-admin-order-panel.ts): el almacén del panel,
// sembrado con demo-orders.ts, también responde como OrderRepository para que
// el listado, el CSV y el seguimiento reflejen los cambios hechos en el panel.
const orders: OrderRepository = demoAdminOrderPanel;
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

/**
 * Caso de uso: listado de pedidos del panel (RF-28). La pantalla y la
 * exportación verifican antes el rol (sección "pedidos").
 */
export async function listAdminOrders(query: AdminOrderQuery): Promise<AdminOrderPage> {
  return applyAdminOrderQuery(await orders.listAll(), query);
}

/** Caso de uso: CSV con todos los pedidos que cumplen los filtros de la URL, sin paginar. */
export async function exportAdminOrdersCsv(
  params: Record<string, string | string[] | undefined>,
): Promise<string> {
  return ordersToCsv(filterAdminOrders(await orders.listAll(), parseAdminOrderQuery(params)));
}

// ── Panel: detalle, pagos y resumen (Tanda A) ────────────────────────────────
// DEMO hasta LN-09/LN-16. Las pantallas y las Server Actions verifican el rol antes.
export const adminOrderPanel: AdminOrderPanel = demoAdminOrderPanel;

/** Caso de uso: detalle del pedido en el panel (RF-27). null si no existe. */
export async function getAdminOrder(id: string): Promise<AdminOrderRecord | null> {
  const orderId = normalizeOrderId(id);
  return orderId ? adminOrderPanel.get(orderId) : null;
}

/** Caso de uso: intentos de pago de todos los pedidos (RF-33). */
export async function listPaymentAttempts(): Promise<PaymentAttemptRow[]> {
  return (await adminOrderPanel.list()).flatMap((record) =>
    record.attempts.map((attempt, index) => ({
      orderId: record.order.id,
      buyerName: record.order.buyerName,
      commerceOrder: attempt.commerceOrder,
      amount: attempt.amount,
      status: attempt.status,
      createdAt: attempt.createdAt,
      lastCheckedAt: attempt.lastCheckedAt,
      current: index === record.attempts.length - 1,
    })),
  );
}

/** Caso de uso: indicadores y últimos pedidos del resumen del panel. */
export async function getAdminOrdersOverview(recent = 5) {
  const records = await adminOrderPanel.list();
  return {
    overview: ordersOverview(records),
    recent: [...records]
      .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt))
      .slice(0, recent),
  };
}
