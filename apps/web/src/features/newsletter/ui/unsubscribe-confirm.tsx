"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button, ButtonLink } from "@/shared/ui/button";

import { confirmUnsubscribeAction } from "./subscription-actions";

/**
 * Confirmación de la baja desde el enlace del correo (RF-35). La baja se hace
 * con un botón y no al abrir la página: los filtros de correo abren los enlaces
 * por su cuenta y darían de baja a la persona sin que lo pida.
 */
export function UnsubscribeConfirm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmUnsubscribeAction, null);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) resultRef.current?.focus();
  }, [state]);

  if (state?.status === "done") {
    return (
      <div ref={resultRef} tabIndex={-1} role="status" className="flex flex-col gap-3">
        <p className="rounded-2xl bg-soft-green px-4 py-3 font-bold">
          Listo: ya no recibirás nuestro newsletter. Tus pedidos y su seguimiento no cambian.
        </p>
        <ButtonLink href="/" variant="outline" size="lg" className="self-start">
          Volver a la tienda
        </ButtonLink>
      </div>
    );
  }

  if (state?.status === "invalid" || !token) {
    return (
      <div ref={resultRef} tabIndex={-1} role="alert" className="flex flex-col gap-3">
        <p className="rounded-2xl bg-soft-red px-4 py-3 font-bold text-brand-red-deep">
          Este enlace de baja no es válido o ya no está vigente.
        </p>
        <p className="text-text-body">
          Pide uno nuevo con tu correo y te lo enviaremos de inmediato.
        </p>
        <ButtonLink href="/suscripcion?baja=1#baja" size="lg" className="self-start">
          Pedir un enlace nuevo
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.status === "error" ? (
        <div ref={resultRef} tabIndex={-1} role="alert">
          <p className="rounded-2xl bg-soft-red px-4 py-3 font-bold text-brand-red-deep">
            {state.message}
          </p>
        </div>
      ) : null}
      <p className="text-text-body">
        Dejarás de recibir ofertas y novedades de Total Kids en tu correo. Puedes volver a
        suscribirte cuando quieras.
      </p>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="danger" size="lg" className="self-start" disabled={pending}>
        {pending ? "Procesando…" : "Confirmar la baja"}
      </Button>
    </form>
  );
}
