import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getAdminSession } from "@/features/auth";
import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge } from "@/shared/ui/admin/status-badge";
import { formatPrice } from "@/shared/ui/format-price";

import { getAdminOrder } from "../container";
import {
  needsTracking,
  ORDER_REFUND_STATE_LABEL,
  REFUND_STATUS_LABEL,
  statusOptionLabel,
  type AdminOrderDetail,
  type HistoryEntry,
} from "../domain/admin-order";
import { chileDate } from "../domain/order-workflow";
import { resolveRefundAction } from "./admin-order-actions";
import { InvoiceForm } from "./admin/invoice-form";
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
  factura: { message: "Factura registrada. Quedó en el historial del pedido.", tone: "success" },
  "factura-corregida": {
    message: "Folio corregido. El cambio y su motivo quedaron en el historial.",
    tone: "success",
  },
  "sin-permiso": {
    message: "Solo el Administrador gestiona reembolsos manuales.",
    tone: "warning",
  },
};

const UNRESOLVED_PAYMENT_MESSAGE =
  "El último pago sigue pendiente o en revisión: no se puede cancelar ni vencer hasta resolverlo.";

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
  const [order, session] = await Promise.all([getAdminOrder(id), getAdminSession()]);
  if (!order) notFound();

  const isAdmin = session?.role === "admin";
  const notice = NOTICES[first(searchParams.aviso)];
  const pickup = order.delivery.method === "pickup";

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
            / <span aria-current="page">#{order.ref}</span>
          </>
        }
        title={`Pedido #${order.ref}`}
        description={`Realizado el ${formatDate(order.createdAt)} · ${order.buyer.name}`}
        actions={
          <>
            <AdminOrderStatusBadge status={order.status} />
            <AdminPaymentBadge
              status={order.payment.status === "none" ? null : order.payment.status}
            />
          </>
        }
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}

      <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0">
          <AdminPanel title="Productos del pedido" flush>
            <DataTable
              caption={`Productos del pedido ${order.ref}`}
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
                      meta={[
                        line.sku,
                        line.option,
                        ...line.extras,
                        line.madeToOrder ? "A pedido" : null,
                        "Precio al comprar",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ),
                  quantity: line.quantity,
                  unit: (
                    <>
                      {formatPrice(line.unitPrice)}
                      {line.extrasUnitPrice > 0 ? (
                        <span className="block text-xs text-text-secondary">
                          + {formatPrice(line.extrasUnitPrice)} extras
                        </span>
                      ) : null}
                    </>
                  ),
                  amount: formatPrice(line.lineTotal),
                },
              }))}
              footer={`${order.lines.length} línea${order.lines.length === 1 ? "" : "s"} · Los precios son una foto del momento de la compra`}
            />
          </AdminPanel>

          <AdminPanel title="Gestionar pedido" id="gestionar">
            <ManageOrder order={order} />
          </AdminPanel>

          {isAdmin && order.refundTotals.charged > 0 ? (
            <AdminPanel
              title="Registrar reembolso manual"
              id="reembolso"
              description="Registra una devolución hecha por un mecanismo externo. Esta acción no mueve dinero."
            >
              <RefundPanel order={order} />
            </AdminPanel>
          ) : null}

          <AdminPanel title="Historial del pedido" id="historial">
            <Timeline entries={order.history} />
          </AdminPanel>
        </div>

        <div className="min-w-0">
          <AdminPanel title="Resumen de pago">
            <PaymentSummary order={order} />
          </AdminPanel>

          <AdminPanel title="Entrega">
            <p className="font-bold">{pickup ? "Retiro en taller" : "Despacho a domicilio"}</p>
            {order.delivery.address ? <p className="mt-1">{order.delivery.address}</p> : null}
            {pickup && order.delivery.pickupDetails ? (
              <p className="mt-1">{order.delivery.pickupDetails}</p>
            ) : null}
            {order.delivery.notes ? (
              <p className="mt-1 text-sm">Notas: {order.delivery.notes}</p>
            ) : null}
            {order.delivery.leadTime ? (
              <p className="mt-1 text-sm">Plazo: {order.delivery.leadTime}</p>
            ) : null}
            <div className="mt-3">
              {pickup ? (
                order.status === "shipped" || order.status === "delivered" ? (
                  <AdminMuted>Listo para retiro en el taller.</AdminMuted>
                ) : (
                  <AdminMuted>Se avisa al comprador cuando esté listo para retiro.</AdminMuted>
                )
              ) : order.delivery.carrier ? (
                <p>
                  <strong>{order.delivery.carrier}</strong>
                  <br />
                  Seguimiento: {order.delivery.trackingCode}
                </p>
              ) : (
                <AdminMuted>Sin transportista ni seguimiento registrados.</AdminMuted>
              )}
            </div>
          </AdminPanel>

          <AdminPanel title="Comprador">
            <p>
              <strong>{order.buyer.name}</strong>
              <br />
              RUT {order.buyer.rut}
              <br />
              <span className="break-all">{order.buyer.email}</span>
              <br />
              {order.buyer.phone}
            </p>
          </AdminPanel>

          <AdminPanel title="Datos de facturación">
            <div id="facturacion" className="flex scroll-mt-24 flex-col gap-3">
              <BillingData order={order} />
              <InvoiceStatus order={order} isAdmin={isAdmin} />
            </div>
          </AdminPanel>
        </div>
      </div>
    </>
  );
}

function ManageOrder({ order }: { order: AdminOrderDetail }) {
  const options = order.transitions;
  const method = order.delivery.method;

  return (
    <div className="flex flex-col gap-4">
      {order.status === "pending_payment" || order.status === "in_review" ? (
        <AdminMuted>
          La confirmación del pedido llega cuando el pago queda confirmado por Flow.
        </AdminMuted>
      ) : null}
      {order.blockedByUnresolvedPayment ? (
        <p role="note" className="rounded-lg border border-input-border bg-cream px-4 py-3 text-sm">
          {UNRESOLVED_PAYMENT_MESSAGE}{" "}
          <Link
            href={`/admin/pagos?pedido=${order.ref}` as Route}
            className="font-extrabold text-brand-blue underline"
          >
            Ver sus pagos
          </Link>
        </p>
      ) : null}
      {order.status === "shipped" ? (
        <AdminMuted>
          Un pedido {method === "pickup" ? "listo para retiro" : "despachado"} no se cancela con un
          cambio de estado: la devolución del producto se gestiona aparte (RN-06).
        </AdminMuted>
      ) : null}
      {options.length > 0 ? (
        <OrderStatusForm
          key={`${order.status}-${order.history.length}`}
          orderId={order.ref}
          options={options.map((to) => ({ value: to, label: statusOptionLabel(to, method) }))}
          showTracking={needsTracking(method, options)}
          tracking={
            order.delivery.carrier
              ? { carrier: order.delivery.carrier, code: order.delivery.trackingCode ?? "" }
              : null
          }
          showRestock={order.canRecordRestock && options.includes("cancelled")}
          cancelsPaidOrder={options.includes("cancelled") && order.refundTotals.charged > 0}
        />
      ) : order.blockedByUnresolvedPayment ? null : (
        <AdminMuted>
          Un pedido «{statusOptionLabel(order.status, method)}» no admite más cambios de estado.
        </AdminMuted>
      )}
    </div>
  );
}

function RefundPanel({ order }: { order: AdminOrderDetail }) {
  const totals = order.refundTotals;
  const today = chileDate(new Date().toISOString());
  const paidOn = order.payment.paidAt ? chileDate(order.payment.paidAt) : today;

  return (
    <div className="flex flex-col gap-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>
          Registrado: <strong>{formatPrice(totals.committed)}</strong> /{" "}
          {formatPrice(totals.charged)} cobrado
        </span>
        <StatusBadge tone={totals.state === "not_requested" ? "neutral" : "blue"}>
          {ORDER_REFUND_STATE_LABEL[totals.state]}
        </StatusBadge>
      </p>

      {order.refunds.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {order.refunds.map((refund) => (
            <li
              key={refund.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <strong>
                  {formatPrice(refund.amount)} · {REFUND_STATUS_LABEL[refund.status]}
                </strong>
                <small className="text-xs text-text-secondary">
                  {refund.date} · Ref. {refund.reference} · {refund.registeredBy}
                </small>
              </span>
              {refund.status === "requested" ? (
                <form action={resolveRefundAction} className="flex flex-wrap gap-1">
                  <input type="hidden" name="id" value={order.ref} />
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

      {totals.refundable > 0 ? (
        <RefundForm
          key={order.refunds.length}
          orderId={order.ref}
          remaining={totals.refundable}
          minDate={paidOn}
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

function PaymentSummary({ order }: { order: AdminOrderDetail }) {
  const { amounts } = order;
  const rows: [ReactNode, ReactNode][] = [
    ["Productos y extras", formatPrice(amounts.subtotal)],
    [
      amounts.couponCode ? `Descuento (${amounts.couponCode})` : "Descuento",
      amounts.discount > 0 ? `− ${formatPrice(amounts.discount)}` : formatPrice(0),
    ],
    [
      "Despacho",
      order.delivery.method === "pickup"
        ? "Retiro en taller"
        : amounts.shippingCost === null
          ? "A coordinar"
          : formatPrice(amounts.shippingCost),
    ],
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
          {formatPrice(amounts.total)}
        </dd>
        <dt className="text-text-secondary">Medio de pago</dt>
        <dd className="text-right">Flow</dd>
        {order.refundTotals.committed > 0 ? (
          <>
            <dt className="text-text-secondary">Reembolsos registrados</dt>
            <dd className="text-right tabular-nums">{formatPrice(order.refundTotals.committed)}</dd>
          </>
        ) : null}
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-extrabold">Intentos de pago</h3>
        {order.attempts.length === 0 ? (
          <AdminMuted>Sin intentos de pago.</AdminMuted>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {order.attempts.map((attempt) => (
              <li key={attempt.commerceOrder} className="flex flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="break-all">{attempt.commerceOrder}</strong>
                  <StatusBadge tone="neutral">{attempt.label}</StatusBadge>
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

const KIND_LABEL: Record<HistoryEntry["kind"], string> = {
  status: "Estado",
  refund: "Reembolso",
  restock: "Stock",
  invoice: "Factura",
};

function Timeline({ entries }: { entries: readonly HistoryEntry[] }) {
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
            <strong className="min-w-0">{entry.title}</strong>
          </span>
          <small className="text-xs text-text-secondary">
            <time dateTime={entry.at}>{formatDateTime(entry.at)}</time> · {entry.actor}
          </small>
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

function BillingData({ order }: { order: AdminOrderDetail }) {
  const { billing } = order;
  if (billing.document === "boleta") {
    return (
      <p>
        <strong>Boleta</strong>
        <br />
        {order.buyer.name}
        <br />
        <span className="break-all">{order.buyer.email}</span>
      </p>
    );
  }
  return (
    <p>
      <strong>Factura</strong>
      {billing.businessName ? (
        <>
          <br />
          {billing.businessName}
        </>
      ) : null}
      {billing.rut ? (
        <>
          <br />
          RUT {billing.rut}
        </>
      ) : null}
      {billing.activity ? (
        <>
          <br />
          Giro: {billing.activity}
        </>
      ) : null}
      {billing.address ? (
        <>
          <br />
          {billing.address}
        </>
      ) : null}
      {billing.email ? (
        <>
          <br />
          <span className="break-all">{billing.email}</span>
        </>
      ) : null}
    </p>
  );
}

/**
 * Boleta: la cubre el comprobante de Flow. Factura: la emite Total Kids fuera
 * de la tienda y aquí se registra el folio; corregirlo es solo del Administrador.
 */
function InvoiceStatus({ order, isAdmin }: { order: AdminOrderDetail; isAdmin: boolean }) {
  const { billing } = order;
  if (billing.document === "boleta") {
    return (
      <AdminMuted>
        El comprobante de pago de Flow hace de boleta: no hay que emitir nada.
      </AdminMuted>
    );
  }
  if (billing.invoice) {
    return (
      <>
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="green">Factura emitida</StatusBadge>
          N° {billing.invoice.number} · {billing.invoice.issuedBy} ·{" "}
          {formatDateTime(billing.invoice.issuedAt)}
        </p>
        {isAdmin ? (
          <details className="rounded-lg border border-border px-4 py-3">
            <summary className="cursor-pointer text-sm font-extrabold">Corregir folio</summary>
            <div className="mt-3">
              <InvoiceForm orderRef={order.ref} replace />
            </div>
          </details>
        ) : null}
      </>
    );
  }
  if (!billing.invoicePending) {
    return <AdminMuted>La factura se emite cuando el pago esté confirmado.</AdminMuted>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p>
        <StatusBadge tone="yellow">Factura pendiente de emitir</StatusBadge>
      </p>
      <AdminMuted>
        Emítela en el SII o tu sistema de facturación, envíala al correo para facturas y registra
        aquí el folio.
      </AdminMuted>
      <InvoiceForm orderRef={order.ref} replace={false} />
    </div>
  );
}
