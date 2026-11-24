"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/form";
import { CardIcon } from "@/shared/ui/icons";

import { TERMS_FIELD } from "../domain/payment-confirmation";
import { startPaymentAction } from "./checkout-actions";

/**
 * Aceptación de condiciones y botón hacia Flow (RF-15, RNF-13). La casilla no
 * viene marcada: el comprador la marca a sabiendas. Funciona sin JavaScript; el
 * botón se desactiva mientras se crea el pedido (y la clave idempotente cubre
 * un doble envío sin JavaScript).
 */
export function FlowPaymentForm() {
  const [state, formAction, pending] = useActionState(startPaymentAction, null);
  const termsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state?.error) termsRef.current?.querySelector("input")?.focus();
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <div ref={termsRef}>
        <Checkbox
          name={TERMS_FIELD}
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "condiciones-error" : undefined}
          label={
            <>
              He revisado las{" "}
              <Link href="/politicas" className="font-extrabold underline">
                condiciones de compra, despacho y privacidad
              </Link>
              .
            </>
          }
        />
      </div>
      {state?.error ? (
        <p id="condiciones-error" role="alert" className="text-sm font-bold text-brand-red">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="min-h-14" disabled={pending}>
        <CardIcon size={22} />
        {pending ? "Conectando con Flow…" : "Continuar con Flow"}
      </Button>
    </form>
  );
}
