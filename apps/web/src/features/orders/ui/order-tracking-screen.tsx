import Link from "next/link";
import type { ReactNode } from "react";

import { Tito } from "@/shared/ui/brand/tito";
import { ButtonLink } from "@/shared/ui/button";
import { formatPrice } from "@/shared/ui/format-price";
import { ArrowLeftIcon } from "@/shared/ui/icons";

import { getOrderForViewer } from "../container";
import {
  ORDER_STATUS_LABEL,
  orderSubtotal,
  orderTotal,
  TRACKING_STEPS,
  trackingProgress,
  type Order,
} from "../domain/order";
import { formatDate, formatDateTime, OrderStatusBadge } from "./order-format";

const PANEL =
  "flex flex-col gap-4 rounded-[32px] bg-surface p-5 shadow-[0_2px_0_var(--color-border)] sm:p-7";

/**
 * Cuenta del comprador · Detalle y seguimiento (RF-23, RF-36). Lo ve el dueño
 * con sesión o quien lo consultó como invitado; si no, "no encontrado" (igual
 * que si no existiera).
 */
export async function OrderTrackingScreen({ id }: { id: string }) {
  const found = await getOrderForViewer(id);
  if (!found) return <OrderNotFound />;
  const { order, viewer } = found;
  const back = viewer === "owner" ? "/cuenta/pedidos" : "/ingresar";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href={back} className="flex items-center gap-1.5 self-start font-extrabold">
        <ArrowLeftIcon size={18} />
        {viewer === "owner" ? "Mis pedidos" : "Volver"}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(2.25rem,5vw,3rem)] leading-tight font-extrabold">
            Pedido #{order.id}
          </h1>
          <p className="text-text-secondary">
            Realizado el {formatDate(order.createdAt)} · {order.buyerName}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <Tracking order={order} />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <section aria-labelledby="productos" className={PANEL}>
            <h2 id="productos" className="text-[26px] font-extrabold">
              Productos del pedido
            </h2>
            <ul className="flex flex-col gap-3">
              {order.lines.map((line) => (
                <li key={line.sku} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <strong>{line.name}</strong> × {line.quantity}
                    <span className="block text-[13px] text-text-secondary">
                      {line.sku}
                      {line.detail ? ` · ${line.detail}` : ""} · Precio al comprar
                    </span>
                  </span>
                  <strong className="whitespace-nowrap">
                    {formatPrice(line.unitPrice * line.quantity)}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="historial" className={PANEL}>
            <h2 id="historial" className="text-[26px] font-extrabold">
              Historial del pedido
            </h2>
            <ol className="flex flex-col gap-3 border-l-3 border-dashed border-border pl-5">
              {[...order.history].reverse().map((event) => (
                <li key={`${event.at}-${event.label}`} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[27px] size-3 rounded-full bg-brand-blue"
                  />
                  <strong className="block">{event.label}</strong>
                  <span className="text-sm text-text-secondary">{formatDateTime(event.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="flex max-w-full flex-[1_1_320px] flex-col gap-6">
          <section aria-labelledby="resumen-pago" className={PANEL}>
            <h2 id="resumen-pago" className="text-[26px] font-extrabold">
              Resumen de pago
            </h2>
            <dl className="flex flex-col gap-2.5">
              <Row term="Productos y extras">{formatPrice(orderSubtotal(order))}</Row>
              <Row term="Descuento">{formatPrice(-order.discount || 0)}</Row>
              <Row term="Despacho">
                {order.shipping === 0 ? "Gratis" : formatPrice(order.shipping)}
              </Row>
              <Row term="Total" strong>
                {formatPrice(orderTotal(order))}
              </Row>
              <Row term="Medio de pago">Flow</Row>
            </dl>
          </section>

          <section aria-labelledby="entrega" className={PANEL}>
            <h2 id="entrega" className="text-[26px] font-extrabold">
              Entrega
            </h2>
            <p>
              <strong>
                {order.delivery.method === "retiro" ? "Retiro en taller" : "Despacho a coordinar"}
              </strong>
              <br />
              {order.delivery.address}
            </p>
            {order.tracking ? (
              <p className="rounded-2xl bg-soft-blue px-4 py-3">
                <strong>{order.tracking.carrier}</strong>
                <br />
                Código de seguimiento: <span className="font-mono">{order.tracking.code}</span>
              </p>
            ) : null}
            <p className="text-sm text-text-secondary">
              Documento:{" "}
              {order.document === "boleta"
                ? "boleta (tu comprobante de pago de Flow)."
                : order.invoice
                  ? `factura N° ${order.invoice.number}, enviada al correo para facturas.`
                  : "factura. Total Kids la emite y la envía al correo para facturas."}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Barra de seguimiento: Recibido → Pagado → En preparación → Despachado → Entregado. */
function Tracking({ order }: { order: Order }) {
  const done = trackingProgress(order.status);
  if (done === null) {
    return (
      <p role="status" className="rounded-3xl bg-soft-red px-5 py-4 font-bold text-brand-red-deep">
        Este pedido está {ORDER_STATUS_LABEL[order.status].toLowerCase()} y no seguirá avanzando.
      </p>
    );
  }
  return (
    <section aria-labelledby="seguimiento" className={PANEL}>
      <h2 id="seguimiento" className="sr-only">
        Seguimiento
      </h2>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
        {TRACKING_STEPS.map((step, i) => {
          const complete = i < done;
          const current = i === done - 1;
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className="flex flex-col items-center gap-2 text-center"
            >
              <span
                aria-hidden
                className={`flex size-11 items-center justify-center rounded-2xl font-heading text-lg font-extrabold ${
                  complete ? "bg-brand-green text-white" : "border-2 border-chip-border bg-surface"
                }`}
              >
                {complete ? "✓" : i + 1}
              </span>
              <span className={`text-sm font-extrabold ${complete ? "" : "text-text-secondary"}`}>
                {step}
                <span className="sr-only">{complete ? " (completado)" : " (pendiente)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Row({
  term,
  strong = false,
  children,
}: {
  term: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "text-lg font-extrabold" : ""}>{term}</dt>
      <dd className={strong ? "font-heading text-[26px] font-extrabold" : "font-bold"}>
        {children}
      </dd>
    </div>
  );
}

function OrderNotFound() {
  return (
    <div className="mx-auto my-8 flex max-w-xl flex-col items-center gap-3 rounded-[32px] bg-surface px-6 py-10 text-center">
      <Tito className="w-24" />
      <h1 className="text-3xl font-extrabold">No encontramos este pedido</h1>
      <p className="text-text-secondary">
        Inicia sesión con la cuenta de la compra, o consúltalo con el número y el correo del pedido.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/ingresar" size="lg">
          Iniciar sesión o consultar
        </ButtonLink>
      </div>
    </div>
  );
}
