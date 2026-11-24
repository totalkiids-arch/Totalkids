import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { InfoNote } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { PaginationNav } from "@/shared/ui/admin/pagination-nav";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { StatCard, StatGrid } from "@/shared/ui/admin/stat-card";
import { StatusBadge } from "@/shared/ui/admin/status-badge";
import { formatPrice } from "@/shared/ui/format-price";
import { SelectField } from "@/shared/ui/form";

import { listPaymentAttempts } from "../container";
import { PAYMENT_FILTERS, toPaymentSearch, type PaymentQuery } from "../domain/payment-query";
import { ATTEMPT_STATUS_LABEL } from "../domain/payment-status";
import { PaymentStatusBadge } from "./payment-status-badge";

const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});
const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso));

/** Panel administrativo · Pagos y conciliación (RF-33, RN-04, RN-05). Solo lectura. */
export async function PaymentsScreen({ query }: { query: PaymentQuery }) {
  const result = await listPaymentAttempts(query);
  const { counts } = result;
  const filtered = query.status !== "todos" || query.order !== "";

  return (
    <>
      <AdminPageHeading
        title="Pagos y conciliación"
        description="Revisa pagos pendientes e inciertos sin asumir que el retorno del navegador confirma un cobro."
      />
      <InfoNote>
        Solo Flow confirma un cobro: el pedido se acredita cuando la API verifica el pago. Los
        intentos pendientes o en revisión se concilian con la consulta de estado a Flow, que llega
        con LN-15. Esta vista no mueve stock ni dinero.
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
        {query.order ? <input type="hidden" name="pedido" value={query.order} /> : null}
        <SelectField
          label="Estado del pago"
          name="estado"
          defaultValue={query.status}
          options={PAYMENT_FILTERS}
        />
      </FilterBar>
      {query.order ? (
        <p className="mb-4 text-sm">
          Intentos del pedido <strong>#{query.order}</strong> ·{" "}
          <Link
            href={`/admin/pagos${toPaymentSearch({ status: query.status })}` as Route}
            className="font-extrabold text-brand-blue underline"
          >
            Ver todos los pedidos
          </Link>
        </p>
      ) : null}

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
            { key: "note", label: "Conciliación" },
          ]}
          rows={result.rows.map((row) => ({
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
              note: row.reconcilable ? (
                <StatusBadge tone="yellow">Por conciliar</StatusBadge>
              ) : (
                <span className="text-text-secondary">
                  {row.current ? "Resuelto" : "Intento anterior"}
                </span>
              ),
            },
          }))}
          empty={
            filtered ? (
              <>
                No hay pagos
                {query.status === "todos" ? "" : ` «${ATTEMPT_STATUS_LABEL[query.status]}»`}
                {query.order ? ` del pedido #${query.order}` : ""}.{" "}
                <Link href="/admin/pagos" className="font-extrabold text-brand-blue underline">
                  Ver todos
                </Link>
              </>
            ) : (
              "Todavía no hay intentos de pago."
            )
          }
          footer={`${result.total} intento${result.total === 1 ? "" : "s"} · página ${result.page} de ${result.pageCount}`}
        />
        <PaginationNav
          label="Páginas de pagos"
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(page) => `/admin/pagos${toPaymentSearch({ ...query, page })}` as Route}
        />
      </AdminPanel>
    </>
  );
}
