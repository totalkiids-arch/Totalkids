import { Tito } from "@/shared/ui/brand/tito";
import { formatPrice } from "@/shared/ui/format-price";

import type { OrderSummary } from "../application/order-summary";
import { shippingLabel } from "../domain/shipping";

/** Colores de los cuadritos de cada línea, como en la maqueta. */
const SWATCHES = ["bg-swatch-lilac", "bg-brand-yellow", "bg-brand-green", "bg-brand-blue"];

/**
 * "Tu pedido": líneas, subtotal, despacho y total (RF-08). `invoiceTip` muestra
 * la sugerencia de factura para instituciones (solo en "Datos y facturación").
 */
export function OrderSummaryCard({
  summary,
  invoiceTip = true,
}: {
  summary: OrderSummary;
  invoiceTip?: boolean;
}) {
  return (
    <aside
      aria-labelledby="tu-pedido"
      className="flex max-w-full flex-[1_1_340px] flex-col gap-4 lg:sticky lg:top-6"
    >
      <div className="flex flex-col gap-3 rounded-[32px] bg-surface p-6.5 shadow-[0_2px_0_var(--color-border)]">
        <h2 id="tu-pedido" className="text-[26px] font-extrabold">
          Tu pedido
        </h2>
        <ul className="flex flex-col gap-2.5">
          {summary.lines.map((line, i) => (
            <li key={line.id} className="flex justify-between gap-2.5 text-[15px]">
              <span className="flex min-w-0 gap-2">
                <span
                  aria-hidden
                  className={`mt-1 size-3.5 shrink-0 rounded ${SWATCHES[i % SWATCHES.length]}`}
                />
                <span className="min-w-0">
                  {line.name} × {line.quantity}
                  {line.detail ? (
                    <span className="block text-[13px] text-text-secondary">{line.detail}</span>
                  ) : null}
                </span>
              </span>
              <strong className="whitespace-nowrap">{formatPrice(line.total)}</strong>
            </li>
          ))}
        </ul>

        <hr className="border-t-3 border-dashed border-border" />
        <dl className="flex flex-col gap-2.5">
          <div className="flex justify-between gap-3">
            <dt>Subtotal</dt>
            <dd className="font-extrabold">{formatPrice(summary.subtotal)}</dd>
          </div>
          {summary.discount > 0 ? (
            <div className="flex justify-between gap-3">
              <dt>Descuento</dt>
              <dd className="font-extrabold text-brand-green">−{formatPrice(summary.discount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt>Despacho</dt>
            <dd
              aria-live="polite"
              className={`text-right font-extrabold ${summary.shipping.kind === "free" ? "text-brand-green" : ""}`}
            >
              {shippingLabel(summary.shipping)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-lg font-extrabold">Total</dt>
            <dd className="font-heading text-[32px] font-extrabold">
              {formatPrice(summary.total)}
            </dd>
          </div>
        </dl>
        {summary.shipping.kind === "pending" ? (
          <p className="text-[13px] text-text-secondary">
            {summary.shipping.message ??
              "El despacho se coordina contigo y no está incluido en el total."}
          </p>
        ) : null}
        {summary.shipping.kind === "rate" && summary.shipping.leadTime ? (
          <p className="text-[13px] text-text-secondary">
            Plazo de despacho: {summary.shipping.leadTime}.
          </p>
        ) : null}
        {summary.unpriced.length > 0 ? (
          <p className="rounded-2xl bg-cream px-3.5 py-2.5 text-sm">
            Precio por confirmar, no incluido en el total: {summary.unpriced.join(", ")}.
          </p>
        ) : null}
      </div>

      {invoiceTip ? (
        <div className="flex items-center gap-3 rounded-[28px] bg-brand-yellow p-4.5">
          <Tito className="w-16 shrink-0" />
          <p className="font-heading text-[17px] leading-tight font-bold">
            ¿Compras para un jardín o colegio? Elige factura y te enviamos todo listo.
          </p>
        </div>
      ) : null}
    </aside>
  );
}
