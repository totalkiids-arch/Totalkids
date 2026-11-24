// Raíz de composición de "orders": conecta los puertos con sus adaptadores actuales.
import type { ActivityArea, ActivityEntry } from "@/features/activity";
import type { SaleRecord } from "@/features/reports";

import type { AdminOrderPanel, DemoOrderPanel } from "./application/admin-order-panel";
import {
  GuestOrderUnavailableError,
  type GuestAccessStore,
  type GuestOrderGateway,
  type OrderRepository,
} from "./application/ports";
import {
  filterAdminOrders,
  ordersToCsv,
  parseAdminOrderQuery,
  type AdminOrderListPage,
  type AdminOrderQuery,
} from "./domain/admin-order-query";
import { LOOKUP_NOT_FOUND, normalizeOrderId, parseGuestLookup } from "./domain/guest-lookup";
import type { Order } from "./domain/order";
import { ordersOverview, paidAttempt } from "./domain/order-workflow";
import { apiGuestOrders } from "./infrastructure/api-guest-orders";
import { cookieGuestAccessStore } from "./infrastructure/cookie-guest-access-store";
import { apiAdminOrderPanel } from "./infrastructure/api-admin-order-panel";
import { demoAdminOrderPanel } from "./infrastructure/demo-admin-order-panel";

// DEMO (ver infrastructure/demo-admin-order-panel.ts): el almacén del panel,
// sembrado con demo-orders.ts, alimenta el CSV y los resúmenes que todavía no
// leen la API (ver más abajo). El seguimiento de la tienda ya usa la API.
const orders: OrderRepository = demoAdminOrderPanel;
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

/** Caso de uso: CSV con todos los pedidos que cumplen los filtros de la URL, sin paginar. */
export async function exportAdminOrdersCsv(
  params: Record<string, string | string[] | undefined>,
): Promise<string> {
  return ordersToCsv(filterAdminOrders(await orders.listAll(), parseAdminOrderQuery(params)));
}

// ── TRANSITORIO hasta la etapa 3 de LN-16 ───────────────────────────────────
// El resumen, los reportes, la actividad y el CSV de pedidos todavía leen el
// almacén de demostración (también lo usa el seguimiento de la tienda).
const demoRecords: DemoOrderPanel = demoAdminOrderPanel;

/** Caso de uso: indicadores y últimos pedidos del resumen del panel. */
export async function getAdminOrdersOverview(recent = 5) {
  const records = await demoRecords.list();
  return {
    overview: ordersOverview(records),
    recent: [...records]
      .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt))
      .slice(0, recent),
  };
}

/**
 * Caso de uso: pedidos con cobro confirmado, para el reporte de ventas (RF-30).
 * Las líneas van al precio de compra; los reembolsos, solo los procesados.
 */
export async function listSalesForReports(): Promise<SaleRecord[]> {
  return (await demoRecords.list()).flatMap((record) => {
    const paid = paidAttempt(record);
    if (!paid) return [];
    return [
      {
        orderId: record.order.id,
        buyerName: record.order.buyerName,
        method: "Flow",
        paidAt: paid.createdAt,
        charged: paid.amount,
        lines: record.order.lines.map((line) => ({
          name: line.name,
          sku: line.sku,
          quantity: line.quantity,
          amount: line.unitPrice * line.quantity,
        })),
        refunds: record.refunds
          .filter((refund) => refund.status === "processed")
          .map((refund) => ({ date: refund.date, amount: refund.amount })),
      },
    ];
  });
}

const AUDIT_AREA: Record<string, ActivityArea> = {
  status: "pedidos",
  payment: "pagos",
  refund: "reembolsos",
  invoice: "pedidos",
  restock: "inventario",
};

/**
 * Caso de uso: cambios del equipo en los pedidos, para el historial de
 * actividad (RF-27, RF-34). Los eventos automáticos ("system") se ven en el
 * detalle de cada pedido.
 */
export async function listActivity(): Promise<ActivityEntry[]> {
  return (await demoRecords.list()).flatMap((record) =>
    record.audit.flatMap((entry, index) => {
      const area = AUDIT_AREA[entry.kind];
      if (!area) return [];
      return [
        {
          id: `pedido-${record.order.id}-${index}`,
          at: entry.at,
          actor: entry.actor,
          area,
          action: entry.detail,
          reason: entry.reason,
          reference: { label: `#${record.order.id}`, href: `/admin/pedidos/${record.order.id}` },
        },
      ];
    }),
  );
}
