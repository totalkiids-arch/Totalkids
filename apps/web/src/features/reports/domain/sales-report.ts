/**
 * Reporte de ventas del panel (RF-30). Dominio puro: tipos y período de la URL.
 *
 * Lo calcula la API (GET /admin/reports/sales):
 * - Una venta es un cobro confirmado por Flow. Pendientes, rechazados, en
 *   revisión y vencidos no entran.
 * - La venta cae en el período según la fecha del cobro (día en Chile).
 * - Los reembolsos se informan aparte: cuentan los procesados cuya fecha cae en
 *   el período, aunque el cobro sea de un período anterior.
 * - Neto = cobros − reembolsos procesados del período.
 */

export interface ReportPeriod {
  /** AAAA-MM-DD, incluido. */
  from: string;
  /** AAAA-MM-DD, incluido. */
  to: string;
}

export interface ProductSales {
  name: string;
  sku: string;
  units: number;
  /** Al precio de compra, antes del descuento. */
  amount: number;
}

export interface MethodSales {
  method: string;
  orders: number;
  charged: number;
  refunded: number;
}

export interface Sale {
  /** Número visible del pedido ("TK-1048"). */
  orderRef: string;
  buyerName: string;
  method: string;
  /** Fecha y hora ISO del cobro confirmado. */
  paidAt: string;
  charged: number;
  refundedInPeriod: number;
}

export interface PeriodRefund {
  id: string;
  orderRef: string;
  /** AAAA-MM-DD. */
  date: string;
  amount: number;
  method: string;
  reference: string;
}

export interface SalesReport {
  period: ReportPeriod;
  /** Criterio de fechas, en palabras de la API, para mostrar en la pantalla. */
  criteria: string;
  charged: number;
  refunded: number;
  net: number;
  paidOrders: number;
  /** Cobro promedio por pedido; 0 sin ventas. */
  averageTicket: number;
  refundsCount: number;
  /** Ventas del período, de la más reciente a la más antigua. */
  sales: Sale[];
  /** De mayor a menor monto. */
  byProduct: ProductSales[];
  byMethod: MethodSales[];
  /** Reembolsos procesados con fecha en el período. */
  refunds: PeriodRefund[];
}

/** Período más largo que se puede pedir (un año). */
export const MAX_PERIOD_DAYS = 366;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

export type PeriodResult =
  { ok: true; period: ReportPeriod } | { ok: false; period: ReportPeriod; error: string };

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/**
 * Lee `?desde=&hasta=` de la URL. Sin fechas, el mes en curso hasta hoy.
 * Con un error, devuelve también el período por defecto para mostrar algo útil.
 *
 * @param today Hoy en Chile, AAAA-MM-DD (lo entrega quien llama: regla pura).
 */
export function parseReportPeriod(params: Params, today: string): PeriodResult {
  const fallback = { from: `${today.slice(0, 7)}-01`, to: today };
  const from = first(params.desde);
  const to = first(params.hasta);
  if (!from && !to) return { ok: true, period: fallback };

  const period = { from: from || fallback.from, to: to || fallback.to };
  if (!isRealDate(period.from) || !isRealDate(period.to)) {
    return { ok: false, period: fallback, error: "Elige fechas válidas para el período." };
  }
  if (period.from > period.to) {
    return {
      ok: false,
      period: fallback,
      error: "La fecha inicial debe ser anterior o igual a la final.",
    };
  }
  if (daysBetween(period.from, period.to) >= MAX_PERIOD_DAYS) {
    return { ok: false, period: fallback, error: "Elige un período de hasta un año." };
  }
  return { ok: true, period };
}

/** "?desde=…&hasta=…" del período (enlaces y exportación). */
export function reportPeriodSearch(period: ReportPeriod): string {
  return `?${new URLSearchParams({ desde: period.from, hasta: period.to }).toString()}`;
}

/** Parámetros de GET /admin/reports/sales y de la exportación de ventas. */
export function toApiPeriodSearch(period: ReportPeriod): URLSearchParams {
  return new URLSearchParams({ from: period.from, to: period.to });
}
