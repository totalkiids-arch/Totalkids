"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type Ref } from "react";

import { Button } from "@/shared/ui/button";
import { Checkbox, TextField } from "@/shared/ui/form";

import { CONSENT_TEXT, SUBSCRIPTION_FIELDS as F } from "../domain/subscription";
import {
  subscribeAction,
  unsubscribeAction,
  type SubscriptionFormState,
} from "./subscription-actions";

const PANEL =
  "flex flex-col gap-4 rounded-[32px] bg-surface p-5 shadow-[0_2px_0_var(--color-border)] sm:p-7";

/** Mueve el foco al primer error o al mensaje de éxito después de enviar. */
function useFocusAfterSubmit(state: SubscriptionFormState) {
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) doneRef.current?.focus();
    else formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return { formRef, doneRef };
}

function Success({ text, ref }: { text: string; ref: Ref<HTMLParagraphElement> }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <p ref={ref} tabIndex={-1} className="rounded-2xl bg-soft-green px-4 py-3 font-bold">
        {text}
      </p>
    </div>
  );
}

/** Error general del envío (la API no respondió o hubo demasiados intentos). */
function FormError({ state }: { state: SubscriptionFormState }) {
  if (!state || state.ok || !state.formError) return null;
  return (
    <p role="alert" className="rounded-2xl bg-soft-red px-4 py-3 font-bold text-brand-red-deep">
      {state.formError}
    </p>
  );
}

/**
 * Alta al newsletter (RF-25, RF-35). Si se llega desde la portada, el correo y
 * la casilla vienen como el comprador los dejó allí; aquí confirma el alta.
 */
export function SubscribeForm({
  initialEmail,
  initialConsent,
}: {
  initialEmail: string;
  initialConsent: boolean;
}) {
  const [state, action, pending] = useActionState(subscribeAction, null);
  const { formRef, doneRef } = useFocusAfterSubmit(state);
  const errors = state && !state.ok ? state.errors : {};

  return (
    <section aria-labelledby="suscribirme" className={PANEL}>
      <h2 id="suscribirme" className="text-[26px] font-extrabold">
        Suscribirme
      </h2>
      {state?.ok ? (
        <Success
          ref={doneRef}
          text={`¡Listo! ${state.email} quedó suscrito a las novedades de Total Kids.`}
        />
      ) : (
        <form ref={formRef} action={action} noValidate className="flex flex-col gap-3">
          <FormError state={state} />
          <TextField
            label="Tu correo"
            name={F.email}
            type="email"
            autoComplete="email"
            placeholder="nombre@correo.cl"
            required
            maxLength={254}
            defaultValue={state?.email ?? initialEmail}
            error={errors.correo}
          />
          <div>
            <Checkbox
              name={F.consent}
              required
              defaultChecked={initialConsent}
              aria-invalid={errors.consentimiento ? true : undefined}
              aria-describedby={errors.consentimiento ? "consentimiento-error" : undefined}
              label={CONSENT_TEXT}
              description={
                <>
                  Lee la{" "}
                  <Link href="/politicas#privacidad" className="font-bold underline">
                    política de privacidad
                  </Link>
                  .
                </>
              }
            />
            {errors.consentimiento ? (
              <p id="consentimiento-error" className="text-sm font-bold text-brand-red">
                {errors.consentimiento}
              </p>
            ) : null}
          </div>
          <Button type="submit" size="lg" className="self-start" disabled={pending}>
            {pending ? "Suscribiendo…" : "Suscribirme"}
          </Button>
        </form>
      )}
    </section>
  );
}

/** Baja del newsletter (RF-25). No revela si el correo estaba en la lista. */
export function UnsubscribeForm({ initialEmail }: { initialEmail: string }) {
  const [state, action, pending] = useActionState(unsubscribeAction, null);
  const { formRef, doneRef } = useFocusAfterSubmit(state);
  const errors = state && !state.ok ? state.errors : {};

  return (
    <section aria-labelledby="darme-de-baja" id="baja" className={PANEL}>
      <h2 id="darme-de-baja" className="text-[26px] font-extrabold">
        Darme de baja
      </h2>
      {state?.ok ? (
        <Success
          ref={doneRef}
          text={`Si ${state.email} está suscrito, le enviamos un correo con el enlace para confirmar la baja.`}
        />
      ) : (
        <form ref={formRef} action={action} noValidate className="flex flex-col gap-3">
          <FormError state={state} />
          <p className="text-text-body">
            Escribe el correo que quieres quitar de la lista. Te enviaremos un enlace para confirmar
            la baja; no necesitas una cuenta.
          </p>
          <TextField
            label="Correo a dar de baja"
            name={F.email}
            type="email"
            autoComplete="email"
            placeholder="nombre@correo.cl"
            required
            maxLength={254}
            defaultValue={state?.email ?? initialEmail}
            error={errors.correo}
          />
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="self-start"
            disabled={pending}
          >
            {pending ? "Enviando…" : "Enviarme el enlace de baja"}
          </Button>
        </form>
      )}
    </section>
  );
}
