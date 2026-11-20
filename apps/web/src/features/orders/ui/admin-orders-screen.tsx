import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { InfoNote } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { PaginationNav } from "@/shared/ui/admin/pagination-nav";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";
import { buttonClasses } from "@/shared/ui/button";
import { formatPrice } from "@/shared/ui/format-price";
import { SelectField, TextField } from "@/shared/ui/form";

import { listAdminOrders } from "../container";
import {
  ORDER_STATUS_FILTERS,
  PAYMENT_STATUS_LABEL,
  parseAdminOrderQuery,
  paymentStatus,
  toAdminOrderSearch,
  type AdminOrderQuery,
  type PaymentStatus,
} from "../domain/admin-order-query";
import { ORDER_STATUS_LABEL, orderTone, orderTotal, type OrderTone } from "../domain/order";
import { formatDateTime } from "./order-format";

const STATUS_TONE: Record<OrderTone, StatusTone> = {
  success: "green",
  progress: "blue",
  waiting: "yellow",
  closed: "red",
};

const PAYMENT_TONE: Record<PaymentStatus, StatusTone> = {
  paid: "green",
  pending: "yellow",
  uncertain: "red",
  unpaid: "neutral",
};

const listHref = (query: AdminOrderQuery) => `/admin/pedidos${toAdminOrderSearch(query)}` as Route;

/** Panel administrativo · Pedidos (RF-28). */
export async function AdminOrdersScreen({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const query = parseAdminOrderQuery(searchParams);
  const result = await listAdminOrders(query);
  const filtered = query.q !== "" || query.status !== "todos";

  return (
    <>
      <AdminPageHeading
        title="Pedidos"
        description="Consulta compras y acompaña cada pedido hasta su entrega."
        actions={
          // Enlace normal (no <Link>): la respuesta es un archivo, no una página.
          <a
            href={`/admin/pedidos/exportar${toAdminOrderSearch({ ...query, page: 1 })}`}
            className={buttonClasses({ variant: "outline" })}
          >
            Exportar CSV
          </a>
        }
      />
      <InfoNote>
        Pedidos de demostración. La API de pedidos real llega en LN-09; hasta entonces el listado es
        de solo lectura.
      </InfoNote>

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
            const payment = paymentStatus(order.status);
            return {
              key: order.id,
              cells: {
                order: <CellTitle title={`#${order.id}`} meta={formatDateTime(order.createdAt)} />,
                customer: <CellTitle title={order.buyerName} meta={order.email} />,
                status: (
                  <StatusBadge tone={STATUS_TONE[orderTone(order.status)]}>
                    {ORDER_STATUS_LABEL[order.status]}
                  </StatusBadge>
                ),
                payment: (
                  <StatusBadge tone={PAYMENT_TONE[payment]}>
                    {PAYMENT_STATUS_LABEL[payment]}
                  </StatusBadge>
                ),
                total: formatPrice(orderTotal(order)),
                actions: (
                  <Link
                    href={`/admin/pedidos/${order.id}` as Route}
                    className={TEXT_ACTION}
                    aria-label={`Ver pedido ${order.id}`}
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
          footer={`${result.total} pedido${result.total === 1 ? "" : "s"} · página ${result.page} de ${result.pageCount} · Datos de demostración`}
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
