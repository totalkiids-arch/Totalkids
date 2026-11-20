"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { site } from "@/shared/config/site";
import { Button } from "@/shared/ui/button";
import { Checkbox, SelectField, TextareaField, TextField } from "@/shared/ui/form";
import { ArrowLeftIcon, ArrowRightIcon, PinIcon } from "@/shared/ui/icons";

import { summarizeOrder } from "../application/order-summary";
import type { CheckoutCart } from "../application/ports";
import type { CheckoutValues } from "../domain/checkout-draft";
import {
  CHECKOUT_FIELDS as F,
  type CheckoutField,
  type DeliveryMethod,
  type TaxDocument,
} from "../domain/checkout-details";
import { REGIONS } from "@/shared/config/regions";
import { submitCheckoutDetailsAction } from "./checkout-actions";
import { OrderSummaryCard } from "./order-summary-card";

const REGION_OPTIONS = [
  { value: "", label: "Elige una región" },
  ...REGIONS.map((r) => ({ value: r.code, label: r.name })),
];

const asMethod = (v: string | undefined): DeliveryMethod =>
  v === "retiro" ? "retiro" : "domicilio";
const asDocument = (v: string | undefined): TaxDocument => (v === "factura" ? "factura" : "boleta");

interface CheckoutDetailsFormProps {
  cart: CheckoutCart;
  /** Lo que el comprador ya había guardado (al volver desde el pago). */
  initialValues: CheckoutValues;
  freeShippingThreshold: number | null;
}

/**
 * Formulario "Datos y facturación" (RF-09 a RF-11). Funciona sin JavaScript
 * (Server Action); con JavaScript muestra solo las secciones que aplican,
 * actualiza el costo de despacho del resumen y lleva el foco al primer error.
 */
export function CheckoutDetailsForm({
  cart,
  initialValues,
  freeShippingThreshold,
}: CheckoutDetailsFormProps) {
  const [state, formAction, pending] = useActionState(submitCheckoutDetailsAction, null);
  const values = state?.values ?? initialValues;
  const errors = state?.errors ?? {};
  const errorCount = Object.keys(errors).length;

  const [method, setMethod] = useState(asMethod(initialValues[F.delivery]));
  const [taxDocument, setTaxDocument] = useState(asDocument(initialValues[F.document]));

  // Tras un envío con errores, las opciones vuelven a lo enviado.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state) {
      setMethod(asMethod(state.values[F.delivery]));
      setTaxDocument(asDocument(state.values[F.document]));
    }
  }

  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state) return;
    const firstInvalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"], [data-invalid]',
    );
    (firstInvalid ?? alertRef.current)?.focus();
  }, [state]);

  /** Props comunes de un campo de texto: nombre, valor guardado y error. */
  const field = (name: CheckoutField) => ({
    name,
    defaultValue: values[name] ?? "",
    error: errors[name],
  });

  const summary = summarizeOrder(cart, method, freeShippingThreshold);

  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-6 px-4 py-4 sm:px-6">
      <form
        ref={formRef}
        action={formAction}
        noValidate
        aria-labelledby="checkout-titulo"
        className="flex min-w-0 flex-[999_1_600px] flex-col gap-5"
      >
        <h1
          id="checkout-titulo"
          className="text-[38px] leading-tight font-extrabold sm:text-[46px]"
        >
          ¿A dónde llevamos la diversión?
        </h1>

        {state && (errorCount > 0 || state.message) ? (
          <div
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="rounded-3xl bg-soft-red px-5 py-4 font-bold text-brand-red-deep"
          >
            {state.message ??
              (errorCount === 1
                ? "Revisa el campo marcado para continuar."
                : `Revisa los ${errorCount} campos marcados para continuar.`)}
          </div>
        ) : null}

        <Section letter="A" tone="bg-brand-yellow" title="Tus datos">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
            <TextField
              label="Nombre y apellido"
              autoComplete="name"
              placeholder="María González"
              required
              maxLength={120}
              {...field(F.name)}
            />
            <TextField
              label="RUT"
              placeholder="12.345.678-5"
              hint="Con guion y dígito verificador."
              required
              maxLength={12}
              {...field(F.rut)}
            />
            <TextField
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              placeholder="nombre@correo.cl"
              required
              maxLength={254}
              {...field(F.email)}
            />
            <TextField
              label="Teléfono"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+56 9 1234 5678"
              required
              maxLength={20}
              {...field(F.phone)}
            />
          </div>
        </Section>

        <Section letter="B" tone="bg-step-blue" title="Entrega">
          <ChoiceCards
            legend="¿Cómo quieres recibir tu pedido?"
            name={F.delivery}
            value={method}
            onChange={(v) => setMethod(asMethod(v))}
            error={errors[F.delivery]}
            options={[
              {
                value: "domicilio",
                label: "Despacho a domicilio",
                description: `Llega a tu casa. ${site.shippingLeadTime}`,
              },
              { value: "retiro", label: "Retiro en tienda", description: "Sin costo" },
            ]}
          />

          {method === "domicilio" ? (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
                <SelectField
                  label="Región"
                  name={F.region}
                  defaultValue={values[F.region] ?? ""}
                  error={errors[F.region]}
                  options={REGION_OPTIONS}
                  required
                />
                <TextField
                  label="Comuna"
                  autoComplete="address-level2"
                  placeholder="Ej: Temuco"
                  required
                  maxLength={60}
                  {...field(F.commune)}
                />
                <TextField
                  label="Calle y número"
                  autoComplete="address-line1"
                  placeholder="Av. Alemania 0123"
                  required
                  maxLength={160}
                  {...field(F.street)}
                />
                <TextField
                  label="Depto. / casa (opcional)"
                  autoComplete="address-line2"
                  placeholder="Depto 45"
                  maxLength={60}
                  {...field(F.unit)}
                />
              </div>
              <TextareaField
                label="Indicaciones para el despacho (opcional)"
                placeholder="Horario en que hay alguien, referencias para encontrar la casa…"
                rows={3}
                maxLength={300}
                {...field(F.notes)}
              />
            </>
          ) : (
            <p className="flex items-center gap-3 rounded-2xl bg-soft-green px-4.5 py-4">
              <PinIcon size={28} className="shrink-0 text-brand-green" />
              <span>
                <strong className="block">Tienda {site.name}</strong>
                <span className="text-sm">
                  {site.address} · {site.hours}
                </span>
              </span>
            </p>
          )}
        </Section>

        <Section letter="C" tone="bg-step-green" title="Documento tributario">
          <ChoiceCards
            legend="¿Boleta o factura?"
            name={F.document}
            value={taxDocument}
            onChange={(v) => setTaxDocument(asDocument(v))}
            error={errors[F.document]}
            options={[
              { value: "boleta", label: "Boleta" },
              { value: "factura", label: "Factura" },
            ]}
          />

          {taxDocument === "boleta" ? (
            <p className="text-text-body">
              Enviaremos tu boleta electrónica al correo que ingresaste en «Tus datos».
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
                <TextField
                  label="RUT empresa"
                  placeholder="76.123.456-0"
                  required
                  maxLength={12}
                  {...field(F.companyRut)}
                />
                <TextField
                  label="Razón social"
                  autoComplete="organization"
                  placeholder="Jardín Infantil Los Peques SpA"
                  required
                  maxLength={160}
                  {...field(F.businessName)}
                />
                <TextField
                  label="Giro"
                  placeholder="Educación preescolar"
                  required
                  maxLength={120}
                  {...field(F.activity)}
                />
                <TextField
                  label="Correo para facturas"
                  type="email"
                  placeholder="facturas@empresa.cl"
                  required
                  maxLength={254}
                  {...field(F.invoiceEmail)}
                />
                <TextField
                  label="Dirección comercial"
                  placeholder="Calle y número"
                  required
                  maxLength={160}
                  {...field(F.invoiceAddress)}
                />
                <TextField
                  label="Comuna"
                  placeholder="Comuna"
                  required
                  maxLength={60}
                  {...field(F.invoiceCommune)}
                />
              </div>
              <Checkbox
                name={F.purchaseOrder}
                label="Necesito orden de compra o cotización formal"
                description="Para compras de jardines, colegios y municipios."
                defaultChecked={values[F.purchaseOrder] === "on"}
              />
            </>
          )}
        </Section>

        <div className="flex flex-wrap-reverse items-center justify-between gap-4">
          <Link href="/carrito" className="flex items-center gap-1.5 font-extrabold">
            <ArrowLeftIcon size={18} />
            Volver al carrito
          </Link>
          <Button type="submit" variant="danger" size="lg" className="min-h-14" disabled={pending}>
            {pending ? "Guardando…" : "Ir a pagar"}
            <ArrowRightIcon size={20} />
          </Button>
        </div>
      </form>

      <OrderSummaryCard summary={summary} />
    </div>
  );
}

function Section({
  letter,
  tone,
  title,
  children,
}: {
  letter: string;
  tone: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[32px] bg-surface p-5 shadow-[0_2px_0_var(--color-border)] sm:p-7">
      <h2 className="flex items-center gap-3 text-[26px] font-extrabold">
        <span
          aria-hidden
          className={`flex size-9.5 shrink-0 items-center justify-center rounded-xl text-xl ${tone}`}
        >
          {letter}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Opciones como tarjetas (radio controlado): despacho/retiro, boleta/factura. */
function ChoiceCards({
  legend,
  name,
  value,
  onChange,
  options,
  error,
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; description?: string }[];
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      className="flex min-w-0 flex-col gap-2"
    >
      <legend className="sr-only">{legend}</legend>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-chip-border bg-surface p-4 has-checked:border-brand-blue has-checked:bg-soft-blue has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-blue"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              data-invalid={error ? true : undefined}
              className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-blue focus-visible:outline-none"
            />
            <span className="flex flex-col">
              <span className="font-extrabold">{option.label}</span>
              {option.description ? (
                <span className="text-[13px] text-text-secondary">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="text-sm font-bold text-brand-red">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
