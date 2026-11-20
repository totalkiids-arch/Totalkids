"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button, ButtonLink } from "@/shared/ui/button";
import { Checkbox, SelectField, TextareaField, TextField } from "@/shared/ui/form";
import { ArrowRightIcon } from "@/shared/ui/icons";

import { MESSAGE_MAX, REQUEST_FIELDS as F, type RequestField } from "../domain/service-request";
import { SERVICES, type ServiceId } from "../domain/services";
import { submitServiceRequestAction } from "./service-request-actions";

const SERVICE_OPTIONS = [
  { value: "", label: "Elige un servicio" },
  ...SERVICES.map((s) => ({ value: s.id, label: s.title })),
];

/**
 * Solicitud de servicio (RF-24). "Enviar otra solicitud" vuelve a montar el
 * formulario para empezar de cero.
 */
export function ServiceRequestForm({ initialService }: { initialService: ServiceId | null }) {
  const [round, setRound] = useState(0);
  return (
    <RequestForm
      key={round}
      initialService={round === 0 ? initialService : null}
      onRestart={() => setRound((r) => r + 1)}
    />
  );
}

function RequestForm({
  initialService,
  onRestart,
}: {
  initialService: ServiceId | null;
  onRestart: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitServiceRequestAction, null);
  const failed = state && !state.ok ? state : null;
  const values = failed?.values ?? {};
  const errors = failed?.errors ?? {};
  const errorCount = Object.keys(errors).length;

  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) doneRef.current?.focus();
    else formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  if (state?.ok) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <h2 ref={doneRef} tabIndex={-1} className="text-3xl font-extrabold">
          ¡Recibimos tu idea!
        </h2>
        <p className="text-lg text-text-body">
          Tu solicitud de <strong>{state.serviceTitle}</strong> quedó con la referencia{" "}
          <strong className="font-mono">{state.reference}</strong>. Te contactaremos en [PLAZO DE
          RESPUESTA] para coordinarla.
        </p>
        <p className="rounded-2xl bg-cream px-4 py-3 text-sm">
          <strong>Solicitud de demostración.</strong> Por ahora no se guarda ni se envía un correo a{" "}
          {state.email}.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <ButtonLink href="/servicios" size="lg">
            Volver a servicios
          </ButtonLink>
          <Button variant="outline" size="lg" onClick={onRestart}>
            Enviar otra solicitud
          </Button>
        </div>
      </div>
    );
  }

  const field = (name: RequestField) => ({
    name,
    defaultValue: values[name] ?? "",
    error: errors[name],
  });

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {errorCount > 0 ? (
        <p role="alert" className="rounded-3xl bg-soft-red px-5 py-4 font-bold text-brand-red-deep">
          {errorCount === 1
            ? "Revisa el campo marcado para enviar tu solicitud."
            : `Revisa los ${errorCount} campos marcados para enviar tu solicitud.`}
        </p>
      ) : null}

      <SelectField
        label="Servicio"
        name={F.service}
        defaultValue={values[F.service] ?? initialService ?? ""}
        error={errors[F.service]}
        options={SERVICE_OPTIONS}
        required
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
        <TextField
          label="Tu nombre"
          autoComplete="name"
          placeholder="Camila González"
          required
          maxLength={120}
          {...field(F.name)}
        />
        <TextField
          label="Correo"
          type="email"
          autoComplete="email"
          placeholder="nombre@correo.cl"
          required
          maxLength={254}
          {...field(F.email)}
        />
        <TextField
          label="Teléfono (opcional)"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+56 9 1234 5678"
          maxLength={20}
          {...field(F.phone)}
        />
        <TextField
          label="Comuna (opcional)"
          autoComplete="address-level2"
          placeholder="Ej: Temuco"
          maxLength={60}
          {...field(F.commune)}
        />
        <TextField
          label="Edad de los niños (opcional)"
          placeholder="Ej: 3 y 6 años"
          maxLength={60}
          {...field(F.ages)}
        />
        <TextField label="Fecha preferida (opcional)" type="date" {...field(F.date)} />
      </div>
      <TextareaField
        label="¿Cómo podemos ayudarte?"
        placeholder="Ej: queremos un rincón de lectura en una pieza de 3x3 m"
        hint={`Entre 10 y ${MESSAGE_MAX} caracteres.`}
        rows={5}
        required
        maxLength={MESSAGE_MAX}
        {...field(F.message)}
      />

      <div>
        <Checkbox
          name={F.privacy}
          required
          aria-invalid={errors[F.privacy] ? true : undefined}
          aria-describedby={errors[F.privacy] ? "privacidad-error" : undefined}
          label={
            <>
              Acepto la{" "}
              <Link href="/politicas#privacidad" className="font-extrabold underline">
                política de privacidad
              </Link>
              .
            </>
          }
        />
        {errors[F.privacy] ? (
          <p id="privacidad-error" className="text-sm font-bold text-brand-red">
            {errors[F.privacy]}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="danger"
        size="lg"
        className="min-h-14 self-start"
        disabled={pending}
      >
        {pending ? "Enviando…" : "Enviar solicitud"}
        <ArrowRightIcon size={20} />
      </Button>
    </form>
  );
}
