import Link from "next/link";
import type { ReactNode } from "react";

import { PAYMENT_STATUS_LABEL, PAYMENT_STATUSES, type PaymentStatus } from "@/features/payments";
import { site } from "@/shared/config/site";
import { ButtonLink } from "@/shared/ui/button";
import { CheckoutSteps } from "@/shared/ui/checkout-steps";
import { formatPrice } from "@/shared/ui/format-price";
import { ClockIcon } from "@/shared/ui/icons";

import { getPaymentResult } from "../container";
import type { ResultTone } from "../domain/payment-result";
import { shippingLabel } from "../domain/shipping";

const TONE = {
  success: { icon: "bg-brand-green text-white", badge: "bg-soft-green text-brand-green" },
  waiting: { icon: "bg-brand-yellow text-brand-navy", badge: "bg-soft-yellow text-on-yellow" },
  error: { icon: "bg-brand-red text-white", badge: "bg-soft-red text-brand-red-deep" },
} as const satisfies Record<ResultTone, { icon: string; badge: string }>;

/**
 * Tienda y compra · Resultado de pago (RF-17). Muestra el estado del pago y
 * ofrece reintentar solo cuando el intento anterior ya no es cobrable.
 */
export async function PaymentResultScreen({ status }: { status: PaymentStatus | null }) {
  const { view, order } = await getPaymentResult(status);
  const tone = TONE[view.tone];

  return (
    <>
      <CheckoutSteps current={view.status === "paid" ? 4 : 3} />
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-4 py-6 text-center sm:px-6">
        <span
          aria-hidden
          className={`flex size-20 items-center justify-center rounded-[26px] ${tone.icon}`}
        >
          <ResultIcon tone={view.tone} />
        </span>
        <div role="status" className="flex flex-col gap-2">
          <h1 className="text-[34px] leading-tight font-extrabold sm:text-[42px]">{view.title}</h1>
          <p className="text-lg text-text-body">{view.message}</p>
        </div>

        <section
          aria-labelledby="resultado-pedido"
          className="flex w-full flex-col gap-4 rounded-[32px] bg-surface p-6 text-left shadow-[0_2px_0_var(--color-border)] sm:p-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="resultado-pedido" className="text-[26px] font-extrabold">
              Tu pedido
            </h2>
            <span className={`rounded-full px-3.5 py-1 text-sm font-extrabold ${tone.badge}`}>
              {PAYMENT_STATUS_LABEL[view.status]}
            </span>
          </div>

          <dl className="flex flex-col gap-2.5">
            {order ? (
              <>
                <Row term="Comprador">{order.buyerName}</Row>
                <Row term="Correo">{order.email}</Row>
              </>
            ) : null}
            <Row term="Medio de pago">Flow</Row>
            {order ? (
              <>
                <Row term="Despacho">{shippingLabel(order.summary.shipping)}</Row>
                <Row term="Documento">
                  {order.document === "boleta"
                    ? "Boleta: el comprobante de pago de Flow que llega a tu correo"
                    : `Factura: Total Kids la envía al correo para facturas dentro de ${site.invoiceLeadTime}`}
                </Row>
                <Row term="Total CLP" strong>
                  {formatPrice(order.summary.total ?? order.summary.subtotal)}
                </Row>
              </>
            ) : null}
          </dl>

          <div className="flex flex-wrap gap-3">
            <ButtonLink href={view.primary.href} size="lg">
              {view.primary.label}
            </ButtonLink>
            <ButtonLink href={view.secondary.href} variant="outline" size="lg">
              {view.secondary.label}
            </ButtonLink>
          </div>
        </section>

        <PreviewLinks current={view.status} />
      </div>
    </>
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
      <dd
        className={`text-right break-words ${strong ? "font-heading text-[28px] font-extrabold" : "font-bold"}`}
      >
        {children}
      </dd>
    </div>
  );
}

/** Íconos propios del resultado (check, reloj y alerta). */
function ResultIcon({ tone }: { tone: ResultTone }) {
  if (tone === "waiting") return <ClockIcon size={40} />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={40}
      height={40}
      fill="none"
      stroke="currentColor"
      strokeWidth={tone === "success" ? 3 : 2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tone === "success" ? (
        <path d="M5 12l5 5 9-10" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 17h.01" />
        </>
      )}
    </svg>
  );
}

/**
 * Selector de estados para revisar la pantalla con el cliente (Hito 1).
 * Elegir un estado no acredita ningún pago. Se quita al conectar Flow (LN-11).
 */
function PreviewLinks({ current }: { current: PaymentStatus }) {
  return (
    <nav
      aria-label="Vista previa de estados de pago"
      className="flex flex-col items-center gap-2.5 rounded-3xl border-2 border-dashed border-chip-border px-5 py-4"
    >
      <p className="text-sm text-text-secondary">
        Vista previa de demostración: elegir un estado no acredita ningún pago.
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
        {PAYMENT_STATUSES.map((status) => (
          <li key={status}>
            <Link
              href={{ pathname: "/checkout/resultado", query: { estado: status } }}
              aria-current={status === current ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-full border-2 border-chip-border bg-surface px-4 text-sm font-extrabold aria-[current=page]:border-brand-blue aria-[current=page]:bg-soft-blue"
            >
              {PAYMENT_STATUS_LABEL[status]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
