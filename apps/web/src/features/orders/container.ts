// Raíz de composición de "orders": conecta los puertos con sus adaptadores actuales.
import type { ActivityArea, ActivityEntry } from "@/features/activity";
import type { SaleRecord } from "@/features/reports";

import type { AdminOrderPanel, DemoOrderPanel } from "./application/admin-order-panel";
import type { GuestAccessStore, OrderRepository } from "./application/ports";
import {
  filterAdminOrders,
  ordersToCsv,
  parseAdminOrderQuery,
  type AdminOrderListPage,
  type AdminOrderQuery,
} from "./domain/admin-order-query";
import {
  canViewOrder,
  LOOKUP_NOT_FOUND,
  normalizeOrderId,
  parseGuestLookup,
} from "./domain/guest-lookup";
import type { Order } from "./domain/order";
import { ordersOverview, paidAttempt } from "./domain/order-workflow";
import { cookieGuestAccessStore } from "./infrastructure/cookie-guest-access-store";
import { apiAdminOrderPanel } from "./infrastructure/api-admin-order-panel";
import { demoAdminOrderPanel } from "./infrastructure/demo-admin-order-panel";

// DEMO (ver infrastructure/demo-admin-order-panel.ts): el almacén del panel,
// sembrado con demo-orders.ts, también responde como OrderRepository para que
// el listado, el CSV y el seguimiento reflejen los cambios hechos en el panel.
const orders: OrderRepository = demoAdminOrderPanel;
const guestAccess: GuestAccessStore = cookieGuestAccessStore;

/**
 * Caso de uso: detalle y seguimiento (RF-36). Los compradores no tienen cuenta:
 * lo ve quien lo consultó en este navegador con número y correo de la compra.
 * Si no existe o no le corresponde, la respuesta es la misma (null): no se
 * revela qué pedidos existen.
 */
export async function getOrderForViewer(id: string): Promise<{ order: Order } | null> {
  const orderId = normalizeOrderId(id);
  if (!orderId) return null;
  const [order, guestOrderIds] = await Promise.all([orders.findById(orderId), guestAccess.read()]);
  if (!order || !canViewOrder(order, { guestOrderIds })) return null;
  return { order };
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
