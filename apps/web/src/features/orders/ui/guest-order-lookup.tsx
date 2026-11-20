"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form";

import { LOOKUP_FIELDS as F } from "../domain/guest-lookup";
import { lookupGuestOrderAction } from "./guest-lookup-actions";

/**
 * "¿Compraste sin cuenta?" (RF-36): número de pedido + correo de la compra.
 * Si coinciden, abre el detalle y seguimiento del pedido.
 */
export function GuestOrderLookup() {
  const [state, action, pending] = useActionState(lookupGuestOrderAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!state) return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? alertRef.current)?.focus();
  }, [state]);

  return (
    <section
      aria-labelledby="pedido-invitado"
      className="flex flex-col gap-4 rounded-[32px] bg-soft-blue p-6 sm:p-8"
    >
      <div>
        <h2 id="pedido-invitado" className="text-[26px] font-extrabold">
          ¿Compraste sin cuenta?
        </h2>
        <p className="text-text-body">
          Consulta el estado de tu pedido con el número y el correo de la compra.
        </p>
      </div>
      <form ref={formRef} action={action} noValidate className="flex flex-col gap-3">
        {state?.message ? (
          <p
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="rounded-2xl bg-soft-red px-4 py-3 font-bold text-brand-red-deep"
          >
            {state.message}
          </p>
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <TextField
            label="Número de pedido"
            name={F.orderId}
            placeholder="TK-1048"
            autoComplete="off"
            required
            maxLength={20}
            defaultValue={state?.values.pedido ?? ""}
            error={state?.errors.pedido}
          />
          <TextField
            label="Correo de la compra"
            name={F.email}
            type="email"
            autoComplete="email"
            placeholder="nombre@correo.cl"
            required
            maxLength={254}
            defaultValue={state?.values.correo ?? ""}
            error={state?.errors.correo}
          />
        </div>
        <Button type="submit" variant="dark" size="lg" className="self-start" disabled={pending}>
          {pending ? "Buscando…" : "Ver mi pedido"}
        </Button>
      </form>
      <p className="text-sm text-text-secondary">
        Demostración: prueba con TK-1055 e invitado@example.com.
      </p>
    </section>
  );
}
