// Raíz de composición de "orders": conecta los puertos con sus adaptadores.
import { forwardExport } from "@/shared/infrastructure/panel-export";

import type { AdminOrderPanel } from "./application/admin-order-panel";
import {
  GuestOrderUnavailableError,
  type GuestAccessStore,
  type GuestOrderGateway,
} from "./application/ports";
import {
  parseAdminOrderQuery,
  toAdminOrderSearch,
  toApiOrderFilters,
  type AdminOrderListPage,
  type AdminOrderQuery,
} from "./domain/admin-order-query";
import { LOOKUP_NOT_FOUND, normalizeOrderId, parseGuestLookup } from "./domain/guest-lookup";
import type { Order } from "./domain/order";
import { apiAdminOrderPanel } from "./infrastructure/api-admin-order-panel";
import { apiGuestOrders } from "./infrastructure/api-guest-orders";
import { cookieGuestAccessStore } from "./infrastructure/cookie-guest-access-store";

const guestOrders: GuestOrderGateway = apiGuestOrders;
const guestAccess: GuestAccessStore = cookieGuestAccessStore;

/**
 * Caso de uso: detalle y seguimiento (RF-23, RF-36). Los compradores no tienen
 * cuenta: lo ve quien lo consultó en este navegador con número y correo (la
 * API entregó su credencial). Si no existe o no le corresponde, la respuesta es
 * la misma (null): no se revela qué pedidos existen.
 */
export async function getOrderForViewer(id: string): Promise<{ order: Order } | null> {
  const orderId = normalizeOrderId(id);
  if (!orderId) return null;
  const access = (await guestAccess.read()).find((e) => e.orderId === orderId);
  if (!access) return null;
  const order = await guestOrders.get(orderId, access.token);
  return order ? { order } : null;
}

/**
 * Caso de uso: guardar la credencial de un pedido recién creado (checkout,
 * LN-11), para que el comprador vea su seguimiento sin volver a consultarlo.
 */
export async function rememberGuestOrder(orderId: string, token: string): Promise<void> {
  await guestAccess.grant({ orderId, token });
}

export type GuestLookupResult =
  | { ok: true; orderId: string }
  | { ok: false; errors: { pedido?: string; correo?: string }; message: string | null };

/** Caso de uso: consultar un pedido sin cuenta, con número y correo (RF-23, RF-36). */
export async function lookupGuestOrder(
  input: Partial<Record<string, unknown>>,
): Promise<GuestLookupResult> {
  const parsed = parseGuestLookup(input);
  if (!parsed.ok) return { ...parsed, message: null };
  let found;
  try {
    found = await guestOrders.lookup(parsed.orderId, parsed.email);
  } catch (error) {
    if (error instanceof GuestOrderUnavailableError) {
      return { ok: false, errors: {}, message: error.message };
    }
    throw error;
  }
  if (!found) return { ok: false, errors: {}, message: LOOKUP_NOT_FOUND };
  await guestAccess.grant({ orderId: found.order.id, token: found.token });
  return { ok: true, orderId: found.order.id };
}

// ── Panel: pedidos en la API (LN-13) ────────────────────────────────────────
export const adminOrderPanel: AdminOrderPanel = apiAdminOrderPanel;

/** Caso de uso: listado de pedidos del panel (RF-28), filtrado y paginado por la API. */
export function listAdminOrders(query: AdminOrderQuery): Promise<AdminOrderListPage> {
  return adminOrderPanel.list(query);
}

/** Caso de uso: detalle del pedido en el panel (RF-27). null si no existe. */
export async function getAdminOrder(ref: string) {
  const orderId = normalizeOrderId(ref);
  return orderId ? adminOrderPanel.get(orderId) : null;
}

/** Caso de uso: indicadores y últimos pedidos del resumen del panel (GET /admin/summary). */
export function getPanelSummary() {
  return adminOrderPanel.summary();
}

/**
 * Caso de uso: CSV con todos los pedidos que cumplen los filtros de la URL
 * (RF-28, RF-29), armado por la API. Solo Administrador (lo verifica el Route
 * Handler y la API).
 */
export function exportAdminOrders(
  params: Record<string, string | string[] | undefined>,
): Promise<Response> {
  const query = parseAdminOrderQuery(params);
  return forwardExport(
    "orders",
    toApiOrderFilters(query),
    `/admin/pedidos${toAdminOrderSearch({ q: query.q, status: query.status })}`,
  );
}
