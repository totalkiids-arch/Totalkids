import type { Route } from "next";
import Link from "next/link";

import { getAdminSession } from "@/features/auth";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { ExportNotice } from "@/shared/ui/admin/export-notice";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { PaginationNav } from "@/shared/ui/admin/pagination-nav";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";
import { buttonClasses } from "@/shared/ui/button";
import { formatPrice } from "@/shared/ui/format-price";
import { SelectField, TextField } from "@/shared/ui/form";

import { listAdminOrders } from "../container";
import { statusOptionLabel, type OrderPaymentState } from "../domain/admin-order";
import {
  ORDER_STATUS_FILTERS,
  parseAdminOrderQuery,
  toAdminOrderSearch,
  type AdminOrderQuery,
} from "../domain/admin-order-query";
import { orderTone, type OrderTone } from "../domain/order";
import { formatDateTime } from "./order-format";

const STATUS_TONE: Record<OrderTone, StatusTone> = {
  success: "green",
  progress: "blue",
  waiting: "yellow",
  closed: "red",
};

const PAYMENT_TONE: Record<OrderPaymentState, StatusTone> = {
  paid: "green",
  pending: "yellow",
  in_review: "yellow",
  rejected: "red",
  voided: "neutral",
  expired: "neutral",
  none: "neutral",
};

const listHref = (query: AdminOrderQuery) => `/admin/pedidos${toAdminOrderSearch(query)}` as Route;

/** Panel administrativo · Pedidos (RF-28). */
export async function AdminOrdersScreen({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const query = parseAdminOrderQuery(searchParams);
  const [result, session] = await Promise.all([listAdminOrders(query), getAdminSession()]);
  // Exportar pedidos a CSV es solo del Administrador (lo exige también la API).
  const canExport = session?.role === "admin";
  const filtered = query.q !== "" || query.status !== "todos";

  return (
    <>
      <AdminPageHeading
        title="Pedidos"
        description="Consulta compras y acompaña cada pedido hasta su entrega."
        actions={
          canExport ? (
            // Enlace normal (no <Link>): la respuesta es un archivo, no una página.
            <a
              href={`/admin/pedidos/exportar${toAdminOrderSearch({ ...query, page: 1 })}`}
              className={buttonClasses({ variant: "outline" })}
            >
              Exportar CSV
            </a>
          ) : null
        }
      />

      <ExportNotice aviso={searchParams.aviso} />

      <FilterBar label="Buscar pedidos">
        <TextField
          label="Buscar pedido o cliente"
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="N.º de pedido, nombre o correo"
          className="min-w-0 flex-1 basis-60 sm:max-w-105"
        />
        <SelectField
          label="Estado"
          name="estado"
          defaultValue={query.status}
          options={ORDER_STATUS_FILTERS}
        />
      </FilterBar>

      <AdminPanel flush>
        <DataTable
          caption="Pedidos"
          columns={[
            { key: "order", label: "Pedido / fecha" },
            { key: "customer", label: "Cliente" },
            { key: "status", label: "Estado" },
            { key: "payment", label: "Pago" },
            { key: "total", label: "Total", align: "end" },
            { key: "actions", label: "Acción" },
          ]}
          rows={result.items.map((order) => {
            return {
              key: order.ref,
              cells: {
                order: (
                  <CellTitle
                    title={`#${order.ref}`}
                    meta={`${formatDateTime(order.createdAt)} · ${
                      order.deliveryMethod === "pickup" ? "Retiro" : "Despacho"
                    }`}
                  />
                ),
                customer: <CellTitle title={order.buyerName} meta={order.email} />,
                status: (
                  <span className="inline-flex flex-wrap gap-1.5">
                    <StatusBadge tone={STATUS_TONE[orderTone(order.status)]}>
                      {statusOptionLabel(order.status, order.deliveryMethod)}
                    </StatusBadge>
                    {order.invoicePending ? (
                      <StatusBadge tone="yellow">Factura pendiente</StatusBadge>
                    ) : null}
                  </span>
                ),
                payment: (
                  <StatusBadge tone={PAYMENT_TONE[order.paymentStatus]}>
                    {order.paymentLabel}
                  </StatusBadge>
                ),
                total: formatPrice(order.total),
                actions: (
                  <Link
                    href={`/admin/pedidos/${order.ref}` as Route}
                    className={TEXT_ACTION}
                    aria-label={`Ver pedido ${order.ref}`}
                  >
                    Ver pedido
                  </Link>
                ),
              },
            };
          })}
          empty={
            filtered ? (
              <>
                No hay pedidos con esos filtros.{" "}
                <Link href="/admin/pedidos" className="font-extrabold text-brand-blue underline">
                  Ver todos
                </Link>
              </>
            ) : (
              "Todavía no hay pedidos."
            )
          }
          footer={`${result.total} pedido${result.total === 1 ? "" : "s"} · página ${result.page} de ${result.pageCount}`}
        />
        <PaginationNav
          label="Páginas de pedidos"
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(page) => listHref({ ...query, page })}
        />
      </AdminPanel>
    </>
  );
}
