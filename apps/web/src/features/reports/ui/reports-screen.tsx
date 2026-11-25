import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable } from "@/shared/ui/admin/data-table";
import { ExportNotice } from "@/shared/ui/admin/export-notice";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { StatCard, StatGrid } from "@/shared/ui/admin/stat-card";
import { buttonClasses } from "@/shared/ui/button";
import { formatPrice } from "@/shared/ui/format-price";
import { TextField } from "@/shared/ui/form";

import { reportPeriodSearch, type SalesReport } from "../domain/sales-report";

const DAY = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
/** "1 nov 2026" a partir de AAAA-MM-DD (sin desfase de zona horaria). */
const formatDay = (day: string) => DAY.format(new Date(`${day}T12:00:00Z`));

const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});

const orderLink = (ref: string) => (
  <Link
    href={`/admin/pedidos/${encodeURIComponent(ref)}` as Route}
    className="text-brand-blue underline-offset-4 hover:underline"
  >
    #{ref}
  </Link>
);

/** Panel administrativo · Reportes de ventas (RF-30). */
export function ReportsScreen({
  report,
  error,
  canExport,
  aviso,
}: {
  report: SalesReport;
  /** Error del período pedido; el reporte muestra el período por defecto. */
  error?: string;
  /** Exportar es solo del Administrador (SRS: exportaciones). */
  canExport: boolean;
  /** `?aviso=` de la URL (exportación fallida). */
  aviso?: unknown;
}) {
  const { period } = report;
  return (
    <>
      <AdminPageHeading
        title="Reportes de ventas"
        description="Cobros confirmados por Flow en el período. Los reembolsos se informan por separado."
        actions={
          canExport ? (
            <a
              href={`/admin/reportes/exportar${reportPeriodSearch(period)}`}
              className={buttonClasses({ variant: "outline" })}
            >
              Exportar CSV
            </a>
          ) : null
        }
      />
      {error ? <LiveNotice message={error} tone="warning" /> : null}
      <ExportNotice aviso={aviso} />

      <FilterBar label="Período del reporte" submitLabel="Aplicar período">
        <TextField
          label="Desde"
          name="desde"
          type="date"
          required
          defaultValue={period.from}
          className="w-44"
        />
        <TextField
          label="Hasta"
          name="hasta"
          type="date"
          required
          defaultValue={period.to}
          className="w-44"
        />
      </FilterBar>

      <p className="mb-4 text-sm text-text-secondary">
        Período: del {formatDay(period.from)} al {formatDay(period.to)} (hora de Chile).
      </p>

      <StatGrid label="Indicadores del período">
        <StatCard
          label="Cobros"
          value={formatPrice(report.charged)}
          note="Pagos confirmados por Flow"
        />
        <StatCard
          label="Reembolsos registrados"
          value={formatPrice(report.refunded)}
          note={`${report.refundsCount} procesado${report.refundsCount === 1 ? "" : "s"} en el período`}
        />
        <StatCard
          label="Neto registrado"
          value={formatPrice(report.net)}
          note="Cobros menos reembolsos"
        />
        <StatCard
          label="Pedidos pagados"
          value={report.paidOrders}
          note={
            report.paidOrders > 0
              ? `Promedio ${formatPrice(report.averageTicket)} por pedido`
              : "Sin ventas en el período"
          }
        />
      </StatGrid>

      <AdminPanel title="Ventas por producto" flush>
        <DataTable
          caption="Ventas por producto"
          columns={[
            { key: "product", label: "Producto" },
            { key: "units", label: "Unidades", align: "end" },
            { key: "amount", label: "Productos y extras (antes del descuento)", align: "end" },
          ]}
          rows={report.byProduct.map((p) => ({
            key: p.sku,
            cells: {
              product: <CellTitle title={p.name} meta={p.sku} />,
              units: p.units,
              amount: formatPrice(p.amount),
            },
          }))}
          empty="No hay ventas en este período."
        />
      </AdminPanel>

      <AdminPanel title="Ventas por medio de pago" flush>
        <DataTable
          caption="Ventas por medio de pago"
          columns={[
            { key: "method", label: "Medio" },
            { key: "orders", label: "Pedidos pagados", align: "end" },
            { key: "charged", label: "Cobros", align: "end" },
            { key: "refunded", label: "Reembolsos", align: "end" },
          ]}
          rows={report.byMethod.map((m) => ({
            key: m.method,
            cells: {
              method: m.method,
              orders: m.orders,
              charged: formatPrice(m.charged),
              refunded: formatPrice(m.refunded),
            },
          }))}
          empty="No hay ventas en este período."
        />
      </AdminPanel>

      <AdminPanel title="Pedidos pagados del período" flush>
        <DataTable
          caption="Pedidos pagados del período"
          columns={[
            { key: "order", label: "Pedido" },
            { key: "date", label: "Fecha de cobro" },
            { key: "charged", label: "Cobro", align: "end" },
            { key: "refunded", label: "Reembolsado en el período", align: "end" },
          ]}
          rows={report.sales.map((s) => ({
            key: `${s.orderRef}-${s.paidAt}`,
            cells: {
              order: (
                <CellTitle title={orderLink(s.orderRef)} meta={`${s.buyerName} · ${s.method}`} />
              ),
              date: DATE_TIME.format(new Date(s.paidAt)),
              charged: formatPrice(s.charged),
              refunded: s.refundedInPeriod > 0 ? formatPrice(s.refundedInPeriod) : "—",
            },
          }))}
          empty="No hay ventas en este período."
        />
      </AdminPanel>

      <AdminPanel title="Reembolsos del período" flush>
        <DataTable
          caption="Reembolsos procesados del período"
          columns={[
            { key: "order", label: "Pedido" },
            { key: "date", label: "Fecha" },
            { key: "reference", label: "Referencia" },
            { key: "amount", label: "Monto", align: "end" },
          ]}
          rows={report.refunds.map((r) => ({
            key: r.id,
            cells: {
              order: <CellTitle title={orderLink(r.orderRef)} meta={r.method} />,
              date: formatDay(r.date),
              reference: r.reference,
              amount: formatPrice(r.amount),
            },
          }))}
          empty="No hay reembolsos procesados en este período."
        />
      </AdminPanel>

      <InfoNote>
        {report.criteria} No se incluyen pedidos pendientes, rechazados, en revisión ni vencidos.
        Neto = cobros menos reembolsos registrados.
      </InfoNote>
    </>
  );
}
