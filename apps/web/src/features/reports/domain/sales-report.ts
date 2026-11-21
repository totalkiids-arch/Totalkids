/**
 * Reporte de ventas del panel (RF-30). Dominio puro.
 *
 * - Una venta es un pedido con cobro confirmado por Flow. Pendientes,
 *   rechazados, en revisión y vencidos no entran.
 * - La venta cae en el período según la fecha del cobro (día en Chile).
 * - Los reembolsos se informan aparte (RF-30): cuentan los procesados cuya
 *   fecha cae en el período, aunque el cobro sea de un período anterior.
 * - Neto = cobros − reembolsos procesados del período.
 */

/** Lo que el reporte necesita de un pedido cobrado (lo entrega la feature "orders"). */
export interface SaleRecord {
  orderId: string;
  buyerName: string;
  /** Medio de pago ("Flow"). */
  method: string;
  /** Fecha y hora ISO del cobro confirmado. */
  paidAt: string;
  /** Monto cobrado, en CLP. */
  charged: number;
  /** Líneas del pedido al precio de compra (productos y extras). */
  lines: readonly { name: string; sku: string; quantity: number; amount: number }[];
  /** Reembolsos procesados: fecha AAAA-MM-DD y monto. */
  refunds: readonly { date: string; amount: number }[];
}

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
  amount: number;
}

export interface MethodSales {
  method: string;
  orders: number;
  charged: number;
  refunded: number;
}

export interface SalesReport {
  period: ReportPeriod;
  /** Ventas del período, de la más reciente a la más antigua. */
  sales: (SaleRecord & { refundedInPeriod: number })[];
  charged: number;
  refunded: number;
  net: number;
  paidOrders: number;
  /** Cobro promedio por pedido; 0 sin ventas. */
  averageTicket: number;
  /** De mayor a menor monto. */
  byProduct: ProductSales[];
  byMethod: MethodSales[];
}

/** Período más largo que se puede pedir (un año). */
export const MAX_PERIOD_DAYS = 366;

const CHILE_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario en Chile (AAAA-MM-DD) de una fecha y hora ISO. */
export function chileDay(iso: string): string {
  return CHILE_DAY.format(new Date(iso));
}

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

const inPeriod = (day: string, period: ReportPeriod) => day >= period.from && day <= period.to;

export function buildSalesReport(
  records: readonly SaleRecord[],
  period: ReportPeriod,
): SalesReport {
  const sales = records
    .filter((r) => inPeriod(chileDay(r.paidAt), period))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  // Reembolsos del período, de cualquier pedido (aunque su cobro sea anterior).
  const refundsInPeriod = (r: SaleRecord) =>
    r.refunds.filter((x) => inPeriod(x.date, period)).reduce((sum, x) => sum + x.amount, 0);

  const products = new Map<string, ProductSales>();
  for (const sale of sales) {
    for (const line of sale.lines) {
      const current = products.get(line.sku) ?? {
        name: line.name,
        sku: line.sku,
        units: 0,
        amount: 0,
      };
      current.units += line.quantity;
      current.amount += line.amount;
      products.set(line.sku, current);
    }
  }

  const methods = new Map<string, MethodSales>();
  for (const sale of sales) {
    const current = methods.get(sale.method) ?? {
      method: sale.method,
      orders: 0,
      charged: 0,
      refunded: 0,
    };
    current.orders += 1;
    current.charged += sale.charged;
    methods.set(sale.method, current);
  }
  for (const record of records) {
    const refunded = refundsInPeriod(record);
    if (refunded === 0) continue;
    const current = methods.get(record.method) ?? {
      method: record.method,
      orders: 0,
      charged: 0,
      refunded: 0,
    };
    current.refunded += refunded;
    methods.set(record.method, current);
  }

  const charged = sales.reduce((sum, s) => sum + s.charged, 0);
  const refunded = records.reduce((sum, r) => sum + refundsInPeriod(r), 0);
  return {
    period,
    sales: sales.map((s) => ({ ...s, refundedInPeriod: refundsInPeriod(s) })),
    charged,
    refunded,
    net: charged - refunded,
    paidOrders: sales.length,
    averageTicket: sales.length === 0 ? 0 : Math.round(charged / sales.length),
    byProduct: [...products.values()].sort((a, b) => b.amount - a.amount || b.units - a.units),
    byMethod: [...methods.values()].sort((a, b) => b.charged - a.charged),
  };
}

/** Filas del CSV: una por venta del período (el CSV seguro lo arma shared/lib/csv). */
export const REPORT_CSV_HEADER = [
  "Pedido",
  "Fecha de cobro",
  "Comprador",
  "Medio",
  "Cobro",
  "Reembolsos procesados en el período",
] as const;

export function reportCsvRows(report: SalesReport, formatDateTime: (iso: string) => string) {
  return report.sales.map((s) => [
    s.orderId,
    formatDateTime(s.paidAt),
    s.buyerName,
    s.method,
    s.charged,
    s.refundedInPeriod,
  ]);
}
