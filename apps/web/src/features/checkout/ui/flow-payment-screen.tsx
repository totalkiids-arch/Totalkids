import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { CheckoutSteps } from "@/shared/ui/checkout-steps";
import { ArrowLeftIcon } from "@/shared/ui/icons";

import { getPaymentStep } from "../container";
import type { CheckoutDetails } from "../domain/checkout-details";
import { regionName } from "../domain/regions";
import { FlowPaymentForm } from "./flow-payment-form";
import { OrderSummaryCard } from "./order-summary-card";

/**
 * Tienda y compra · Pago Flow (RF-13, RF-15). Revalida carrito y datos en el
 * servidor: si algo falta, vuelve al carrito o a "Datos y facturación".
 * Pago de demostración: no abre la pasarela real (ver startDemoPayment).
 */
export async function FlowPaymentScreen() {
  const step = await getPaymentStep();
  if (!step.ok) redirect(step.redirectTo);

  return (
    <>
      <CheckoutSteps current={3} />
      <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-6 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-[38px] leading-tight font-extrabold sm:text-[46px]">
              Paga de forma segura con Flow
            </h1>
            <p className="text-text-secondary">Revisa el resumen antes de continuar.</p>
          </div>

          <Panel title="Medio de pago" id="medio-de-pago">
            <p
              aria-hidden
              className="font-heading text-[42px] leading-none font-extrabold text-brand-blue"
            >
              flow
            </p>
            <p>
              Flow aloja la página de pago para completar tu compra: tarjetas, transferencia y más.
              Total Kids no recibe ni almacena datos de tarjeta.
            </p>
            <p className="rounded-2xl bg-cream px-4 py-3 text-sm">
              <strong>Pago de demostración.</strong> Por ahora no se abre la pasarela real ni se
              hace ningún cobro: verás el estado en que queda un pago mientras Flow lo confirma.
            </p>
            <FlowPaymentForm />
          </Panel>

          <ReviewDetails details={step.details} />

          <Link href="/checkout" className="flex items-center gap-1.5 self-start font-extrabold">
            <ArrowLeftIcon size={18} />
            Volver a mis datos
          </Link>
        </div>

        <OrderSummaryCard summary={step.summary} invoiceTip={false} />
      </div>
    </>
  );
}

function Panel({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-[32px] bg-surface p-5 shadow-[0_2px_0_var(--color-border)] sm:p-7"
    >
      <h2 id={id} className="text-[26px] font-extrabold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Lo que el comprador ingresó en "Datos y facturación", para revisarlo antes de pagar. */
function ReviewDetails({ details }: { details: CheckoutDetails }) {
  const { buyer, delivery, billing } = details;
  return (
    <Panel title="Tus datos" id="tus-datos">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Item term="Comprador">
          {buyer.name}
          <br />
          RUT {buyer.rut}
          <br />
          {buyer.email}
          <br />
          {buyer.phone}
        </Item>
        <Item term="Entrega">
          {delivery.method === "retiro" ? (
            "Retiro en tienda"
          ) : (
            <>
              Despacho a domicilio
              <br />
              {delivery.street}
              {delivery.unit ? `, ${delivery.unit}` : ""}
              <br />
              {delivery.commune}, {regionName(delivery.region)}
              {delivery.notes ? (
                <span className="block text-sm text-text-secondary">{delivery.notes}</span>
              ) : null}
            </>
          )}
        </Item>
        <Item term="Documento">
          {billing.document === "boleta" ? (
            "Boleta electrónica"
          ) : (
            <>
              Factura · {billing.businessName}
              <br />
              RUT {billing.rut} · {billing.activity}
              <br />
              {billing.email}
              {billing.purchaseOrder ? (
                <span className="block text-sm text-text-secondary">
                  Con orden de compra o cotización formal
                </span>
              ) : null}
            </>
          )}
        </Item>
      </dl>
      <Link
        href="/checkout"
        className="self-start text-sm font-extrabold text-brand-blue underline"
      >
        Editar mis datos
      </Link>
    </Panel>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm font-extrabold text-text-secondary">{term}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
