import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getAdminSession } from "@/features/auth";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge } from "@/shared/ui/admin/status-badge";
import { formatPrice } from "@/shared/ui/format-price";

import { getAdminOrder } from "../container";
import { ORDER_STATUS_LABEL, orderSubtotal, orderTotal } from "../domain/order";
import {
  availableTransitions,
  blockedByUnresolvedPayment,
  chileDate,
  canRecordRestock,
  chargedAmount,
  committedRefunds,
  orderPaymentStatus,
  paidAttempt,
  REFUND_STATUS_LABEL,
  refundableAmount,
  refundState,
  ORDER_REFUND_STATE_LABEL,
  UNRESOLVED_PAYMENT_MESSAGE,
  type AdminOrderRecord,
  type AuditEntry,
} from "../domain/order-workflow";
import { resolveRefundAction } from "./admin-order-actions";
import { AdminOrderStatusBadge, AdminPaymentBadge } from "./admin/order-badges";
import { OrderStatusForm } from "./admin/order-status-form";
import { RefundForm } from "./admin/refund-form";
import { formatDate, formatDateTime } from "./order-format";

const NOTICES: Record<string, { message: string; tone: "success" | "warning" }> = {
  estado: {
    message: "Cambio guardado. Quedó en el historial con fecha y responsable.",
    tone: "success",
  },
  reembolso: {
    message: "Reembolso manual registrado. Esta acción no movió dinero.",
    tone: "success",
  },
  "reembolso-resuelto": { message: "Estado del reembolso actualizado.", tone: "success" },
  "reembolso-no-resuelto": {
    message: "No se pudo actualizar el reembolso: ya estaba resuelto o no existe.",
    tone: "warning",
  },
  "sin-permiso": {
    message: "Solo el Administrador gestiona reembolsos manuales.",
    tone: "warning",
  },
};

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Panel administrativo · Detalle de pedido y reembolso (RF-27, RF-32, RF-34). */
export async function AdminOrderDetailScreen({
  id,
  searchParams = {},
}: {
  id: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const [record, session] = await Promise.all([getAdminOrder(id), getAdminSession()]);
  if (!record) notFound();

  const { order } = record;
  const isAdmin = session?.role === "admin";
  const notice = NOTICES[first(searchParams.aviso)];

  return (
    <>
      <AdminPageHeading
        crumb={
          <>
            <Link
              href="/admin/pedidos"
              className="text-brand-blue underline-offset-4 hover:underline"
            >
              Pedidos
            </Link>{" "}
            / <span aria-current="page">#{order.id}</span>
          </>
        }
        title={`Pedido #${order.id}`}
        description={`Realizado el ${formatDate(order.createdAt)} · ${order.buyerName}`}
        actions={
          <>
            <AdminOrderStatusBadge status={order.status} />
            <AdminPaymentBadge status={orderPaymentStatus(record)} />
          </>
        }
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}
      <InfoNote>
        Pedido de demostración. Los cambios se guardan en la memoria del servidor y se pierden al
        reiniciar; la API de pedidos llega en LN-09.
      </InfoNote>

      <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0">
          <AdminPanel title="Productos del pedido" flush>
            <DataTable
              caption={`Productos del pedido ${order.id}`}
              columns={[
                { key: "product", label: "Producto" },
                { key: "quantity", label: "Cantidad", align: "end" },
                { key: "unit", label: "Precio unitario", align: "end" },
                { key: "amount", label: "Importe", align: "end" },
              ]}
              rows={order.lines.map((line, index) => ({
                key: `${line.sku}-${index}`,
                cells: {
                  product: (
                    <CellTitle
                      title={line.name}
                      meta={[line.sku, line.detail, "Precio al comprar"]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ),
                  quantity: line.quantity,
                  unit: formatPrice(line.unitPrice),
                  amount: formatPrice(line.unitPrice * line.quantity),
                },
              }))}
              footer={`${order.lines.length} línea${order.lines.length === 1 ? "" : "s"} · Los precios son una foto del momento de la compra`}
            />
          </AdminPanel>

          <AdminPanel title="Gestionar pedido" id="gestionar">
            <ManageOrder record={record} />
          </AdminPanel>

          {isAdmin && paidAttempt(record) ? (
            <AdminPanel
              title="Registrar reembolso manual"
              id="reembolso"
              description="Registra una devolución hecha por un mecanismo externo. Esta acción no mueve dinero."
            >
              <RefundPanel record={record} />
            </AdminPanel>
          ) : null}

          <AdminPanel title="Historial del pedido" id="historial">
            <AuditTimeline entries={record.audit} />
          </AdminPanel>
        </div>

        <div className="min-w-0">
          <AdminPanel title="Resumen de pago">
            <PaymentSummary record={record} />
          </AdminPanel>

          <AdminPanel title="Entrega">
            <p className="font-bold">
              {order.delivery.method === "domicilio" ? "Despacho a coordinar" : "Retiro en taller"}
            </p>
            <p className="mt-1">{order.delivery.address}</p>
            {order.tracking ? (
              <p className="mt-3">
                <strong>{order.tracking.carrier}</strong>
                <br />
                Seguimiento: {order.tracking.code}
              </p>
            ) : (
              <div className="mt-3">
                <AdminMuted>Sin transportista ni seguimiento registrados.</AdminMuted>
              </div>
            )}
          </AdminPanel>

          <AdminPanel title="Datos de facturación">
            <p>
              <strong>{order.document === "factura" ? "Factura" : "Boleta"}</strong>
              <br />
              {order.buyerName}
              <br />
              <span className="break-all">{order.email}</span>
            </p>
            {order.document === "factura" ? (
              <div className="mt-3">
                <AdminMuted>
                  RUT, razón social y giro llegan con los datos del checkout en la API de pedidos
                  (LN-09).
                </AdminMuted>
              </div>
            ) : null}
            <div className="mt-3">
              <AdminMuted>La emisión del documento tributario es externa.</AdminMuted>
            </div>
          </AdminPanel>
        </div>
      </div>
    </>
  );
}

function ManageOrder({ record }: { record: AdminOrderRecord }) {
  const { order } = record;
  const options = availableTransitions(record);
  const blocked = blockedByUnresolvedPayment(record);

  const blockedNote = blocked ? (
    <p role="note" className="rounded-lg border border-input-border bg-cream px-4 py-3 text-sm">
      {UNRESOLVED_PAYMENT_MESSAGE}{" "}
      <Link
        href={`/admin/pagos?pedido=${order.id}#conciliar` as Route}
        className="font-extrabold text-brand-blue underline"
      >
        Ir a conciliar el pago
      </Link>
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {order.status === "pending_payment" || order.status === "in_review" ? (
        <AdminMuted>
          La confirmación del pedido llega cuando el pago queda confirmado en Pagos y conciliación.
        </AdminMuted>
      ) : null}
      {blockedNote}
      {order.status === "shipped" ? (
        <AdminMuted>
          Un pedido despachado no se cancela con un cambio de estado: la devolución del producto se
          gestiona aparte (RN-06).
        </AdminMuted>
      ) : null}
      {options.length > 0 ? (
        <OrderStatusForm
          key={`${order.status}-${record.audit.length}`}
          orderId={order.id}
          options={options.map((to) => ({ value: to, label: ORDER_STATUS_LABEL[to] }))}
          showTracking={options.includes("shipped")}
          tracking={order.tracking}
          showRestock={canRecordRestock(record, "cancelled") && options.includes("cancelled")}
          cancelsPaidOrder={options.includes("cancelled") && paidAttempt(record) !== null}
        />
      ) : blocked ? null : (
        <AdminMuted>
          Un pedido «{ORDER_STATUS_LABEL[order.status]}» no admite más cambios de estado.
        </AdminMuted>
      )}
    </div>
  );
}

function RefundPanel({ record }: { record: AdminOrderRecord }) {
  const charged = chargedAmount(record);
  const committed = committedRefunds(record);
  const remaining = refundableAmount(record);
  const paid = paidAttempt(record);
  const today = chileDate(new Date().toISOString());

  return (
    <div className="flex flex-col gap-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>
          Registrado: <strong>{formatPrice(committed)}</strong> / {formatPrice(charged)} cobrado
        </span>
        <StatusBadge tone={refundState(record) === "not_requested" ? "neutral" : "blue"}>
          {ORDER_REFUND_STATE_LABEL[refundState(record)]}
        </StatusBadge>
      </p>

      {record.refunds.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {record.refunds.map((refund) => (
            <li
              key={refund.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <strong>
                  {formatPrice(refund.amount)} · {REFUND_STATUS_LABEL[refund.status]}
                </strong>
                <small className="text-xs text-text-secondary">
                  {refund.date} · Ref. {refund.reference} · {refund.responsible}
                </small>
              </span>
              {refund.status === "requested" ? (
                <form action={resolveRefundAction} className="flex flex-wrap gap-1">
                  <input type="hidden" name="id" value={record.order.id} />
                  <input type="hidden" name="refundId" value={refund.id} />
                  <button type="submit" name="status" value="processed" className={TEXT_ACTION}>
                    Marcar procesado
                  </button>
                  <button type="submit" name="status" value="failed" className={TEXT_ACTION}>
                    Marcar fallido
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {remaining > 0 && paid ? (
        <RefundForm
          key={record.refunds.length}
          orderId={record.order.id}
          remaining={remaining}
          minDate={chileDate(paid.createdAt)}
          today={today}
        />
      ) : (
        <AdminMuted>
          Ya está registrado todo lo cobrado; no se pueden agregar más reembolsos.
        </AdminMuted>
      )}
    </div>
  );
}

function PaymentSummary({ record }: { record: AdminOrderRecord }) {
  const { order } = record;
  const rows: [ReactNode, ReactNode][] = [
    ["Productos y extras", formatPrice(orderSubtotal(order))],
    ["Descuento", order.discount > 0 ? `− ${formatPrice(order.discount)}` : formatPrice(0)],
    ["Despacho", formatPrice(order.shipping)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value], index) => (
          <div key={index} className="contents">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
        <dt className="border-t border-border pt-2 font-extrabold">Total</dt>
        <dd className="border-t border-border pt-2 text-right font-extrabold tabular-nums">
          {formatPrice(orderTotal(order))}
        </dd>
        <dt className="text-text-secondary">Medio de pago</dt>
        <dd className="text-right">Flow</dd>
        {committedRefunds(record) > 0 ? (
          <>
            <dt className="text-text-secondary">Reembolsos registrados</dt>
            <dd className="text-right tabular-nums">{formatPrice(committedRefunds(record))}</dd>
          </>
        ) : null}
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-extrabold">Intentos de pago</h3>
        {record.attempts.length === 0 ? (
          <AdminMuted>Sin intentos de pago.</AdminMuted>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {record.attempts.map((attempt) => (
              <li key={attempt.commerceOrder} className="flex flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="break-all">{attempt.commerceOrder}</strong>
                  <AdminPaymentBadge status={attempt.status} />
                </span>
                <small className="text-xs text-text-secondary">
                  {formatPrice(attempt.amount)} · {formatDateTime(attempt.createdAt)}
                  {attempt.lastCheckedAt
                    ? ` · Última consulta ${formatDateTime(attempt.lastCheckedAt)}`
                    : ""}
                </small>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<AuditEntry["kind"], string> = {
  status: "Estado",
  payment: "Pago",
  refund: "Reembolso",
  restock: "Stock",
  system: "Registro",
};

function AuditTimeline({ entries }: { entries: readonly AuditEntry[] }) {
  if (entries.length === 0) return <AdminMuted>Sin movimientos registrados.</AdminMuted>;
  return (
    <ol className="flex flex-col gap-4 border-l-2 border-border pl-5">
      {[...entries].reverse().map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="relative flex flex-col gap-0.5">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-surface bg-brand-blue"
          />
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{KIND_LABEL[entry.kind]}</StatusBadge>
            <strong className="min-w-0">
              {entry.to ? `${ORDER_STATUS_LABEL[entry.to]}` : entry.detail}
            </strong>
          </span>
          <small className="text-xs text-text-secondary">
            <time dateTime={entry.at}>{formatDateTime(entry.at)}</time> · {entry.actor}
          </small>
          {entry.to ? <span className="text-sm">{entry.detail}</span> : null}
          {entry.reason ? (
            <span className="text-sm">
              <span className="font-bold">Motivo:</span> {entry.reason}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
