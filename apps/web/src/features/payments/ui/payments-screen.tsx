import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { StatCard, StatGrid } from "@/shared/ui/admin/stat-card";
import { formatPrice } from "@/shared/ui/format-price";
import { SelectField } from "@/shared/ui/form";

import {
  countPaymentAttempts,
  filterPaymentAttempts,
  isReconcilable,
  PAYMENT_FILTERS,
  toPaymentSearch,
  type PaymentAttemptRow,
  type PaymentQuery,
} from "../domain/payment-query";
import { PAYMENT_STATUS_LABEL } from "../domain/payment-status";
import { PaymentStatusBadge } from "./payment-status-badge";
import { ReconcileForm, type ReconcileAction } from "./reconcile-form";

const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});
const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso));

const NOTICES: Record<string, { message: string; tone: "success" | "warning" | "info" }> = {
  pagado: {
    message: "Consulta simulada: Flow confirmó el pago. El pedido quedó confirmado.",
    tone: "success",
  },
  rechazado: {
    message:
      "Consulta simulada: Flow rechazó el pago. El pedido sigue pendiente para un nuevo intento.",
    tone: "warning",
  },
  incierto: {
    message: "Consulta simulada: Flow no respondió. El pago y su pedido quedan en revisión.",
    tone: "info",
  },
};

/** Panel administrativo · Pagos y conciliación (RF-33, RN-04, RN-05). */
export function PaymentsScreen({
  attempts,
  query,
  notice,
  reconcileAction,
}: {
  attempts: readonly PaymentAttemptRow[];
  query: PaymentQuery;
  notice?: string;
  /** Server Action de conciliación; la inyecta la página desde orders. */
  reconcileAction: ReconcileAction;
}) {
  const counts = countPaymentAttempts(attempts);
  const rows = filterPaymentAttempts(attempts, query.status);
  const reconcilable = filterPaymentAttempts(attempts, "todos").filter(isReconcilable);
  const preselected = reconcilable.some((r) => r.orderId === query.order)
    ? query.order
    : (reconcilable[0]?.orderId ?? "");
  const shown = notice ? NOTICES[notice] : undefined;

  return (
    <>
      <AdminPageHeading
        title="Pagos y conciliación"
        description="Revisa pagos pendientes e inciertos sin asumir que el retorno del navegador confirma un cobro."
      />
      {shown ? <LiveNotice message={shown.message} tone={shown.tone} /> : null}
      <InfoNote>
        Las respuestas de Flow se <strong>simulan</strong>: aquí eliges qué respondería la consulta
        de estado. Solo una verificación real del backend (LN-10) puede acreditar un pago y consumir
        reservas. Esta vista no mueve stock ni dinero.
      </InfoNote>

      <StatGrid label="Intentos de pago por estado">
        <StatCard label="Pagados" value={counts.paid} note="Cobros confirmados por Flow" />
        <StatCard label="Pendientes" value={counts.pending} note="Esperan la respuesta de Flow" />
        <StatCard
          label="En revisión"
          value={counts.in_review}
          note="Resultado incierto: no se asume rechazo"
        />
        <StatCard label="Vencidos" value={counts.expired} note="Caducaron sin pagarse" />
      </StatGrid>

      <FilterBar label="Filtrar pagos">
        <SelectField
          label="Estado del pago"
          name="estado"
          defaultValue={query.status}
          options={PAYMENT_FILTERS}
        />
      </FilterBar>

      <AdminPanel flush>
        <DataTable
          caption="Intentos de pago"
          columns={[
            { key: "order", label: "Pedido" },
            { key: "commerce", label: "commerceOrder" },
            { key: "amount", label: "Monto", align: "end" },
            { key: "status", label: "Estado de pago" },
            { key: "date", label: "Fecha" },
            { key: "checked", label: "Última consulta" },
            { key: "action", label: "Acción" },
          ]}
          rows={rows.map((row) => ({
            key: row.commerceOrder,
            cells: {
              order: (
                <CellTitle
                  title={
                    <Link
                      href={`/admin/pedidos/${row.orderId}` as Route}
                      className="text-brand-blue underline-offset-4 hover:underline"
                    >
                      #{row.orderId}
                    </Link>
                  }
                  meta={row.buyerName}
                />
              ),
              commerce: <code className="text-xs">{row.commerceOrder}</code>,
              amount: formatPrice(row.amount),
              status: <PaymentStatusBadge status={row.status} />,
              date: formatDateTime(row.createdAt),
              checked: row.lastCheckedAt ? formatDateTime(row.lastCheckedAt) : "Sin consultas",
              action: isReconcilable(row) ? (
                <Link
                  href={
                    `/admin/pagos${toPaymentSearch({ ...query, order: row.orderId })}#conciliar` as Route
                  }
                  className={TEXT_ACTION}
                  aria-label={`Consultar estado en Flow del pedido ${row.orderId}`}
                >
                  Consultar estado en Flow
                </Link>
              ) : (
                <span className="text-text-secondary">
                  {row.current ? "Resuelto" : "Intento anterior"}
                </span>
              ),
            },
          }))}
          empty={
            query.status === "todos" ? (
              "Todavía no hay intentos de pago."
            ) : (
              <>
                No hay pagos «{PAYMENT_STATUS_LABEL[query.status]}».{" "}
                <Link href="/admin/pagos" className="font-extrabold text-brand-blue underline">
                  Ver todos
                </Link>
              </>
            )
          }
          footer={`${rows.length} intento${rows.length === 1 ? "" : "s"} · Datos de demostración`}
        />
      </AdminPanel>

      <AdminPanel
        id="conciliar"
        title="Simular consulta a Flow"
        description="Elige un pago pendiente o en revisión y la respuesta que daría la consulta de estado."
      >
        {reconcilable.length > 0 ? (
          <ReconcileForm
            key={`${preselected}-${notice ?? ""}`}
            action={reconcileAction}
            preselected={preselected}
            options={reconcilable.map((row) => ({
              value: row.orderId,
              label: `#${row.orderId} · ${row.commerceOrder} · ${PAYMENT_STATUS_LABEL[row.status]}`,
            }))}
          />
        ) : (
          <AdminMuted>No hay pagos pendientes ni en revisión por conciliar.</AdminMuted>
        )}
        <div className="mt-4">
          <AdminMuted>
            Pagado confirma el pedido (si estaba vencido o cerrado, queda en revisión: RN-05).
            Rechazado lo deja pendiente para un nuevo intento. Sin respuesta, queda en revisión: no
            se asume rechazo (RN-04).
          </AdminMuted>
        </div>
      </AdminPanel>
    </>
  );
}
