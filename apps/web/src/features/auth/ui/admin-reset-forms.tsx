"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form";

import { PASSWORD_HINT, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../domain/password-policy";
import { AccessAlert, AccessNotice } from "./access-frame";
import {
  requestResetAction,
  resetPasswordAction,
  type RequestResetState,
  type ResetPasswordState,
} from "./admin-session-actions";

const LINK = "text-sm font-bold text-brand-blue underline-offset-4 hover:underline";

/** Pide el enlace por correo. La respuesta es la misma exista o no la cuenta. */
export function RequestResetForm() {
  const [state, action, pending] = useActionState<RequestResetState, FormData>(requestResetAction, {
    email: "",
    sent: false,
    fieldErrors: {},
  });

  if (state.sent)
    return (
      <>
        <AccessNotice>
          Si {state.email} corresponde a una cuenta activa del panel, te enviamos un enlace para
          definir una contraseña nueva. Vence en 30 minutos.
        </AccessNotice>
        <Link href="/admin/ingresar" className={`mt-5 inline-block ${LINK}`}>
          Volver al ingreso
        </Link>
      </>
    );

  return (
    <>
      <p className="mt-3 text-text-body">
        Escribe el correo de tu cuenta del panel y te enviaremos un enlace.
      </p>
      {state.message ? <AccessAlert>{state.message}</AccessAlert> : null}
      <form action={action} aria-busy={pending} className="mt-5 flex flex-col gap-4">
        <TextField
          label="Correo electrónico"
          name="email"
          type="email"
          defaultValue={state.email}
          key={state.email}
          autoComplete="username"
          maxLength={254}
          error={state.fieldErrors.email}
          required
        />
        <Button type="submit" className="mt-1 w-full" disabled={pending}>
          {pending ? "Enviando…" : "Enviar enlace"}
        </Button>
        <Link href="/admin/ingresar" className={`self-center ${LINK}`}>
          Volver al ingreso
        </Link>
      </form>
    </>
  );
}

/**
 * Define la contraseña con el token del enlace: sirve para la invitación de una
 * cuenta nueva y para la recuperación. El token viaja en un campo oculto.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    { invalidToken: false, fieldErrors: {} },
  );

  if (state.invalidToken)
    return (
      <>
        <AccessAlert>{state.message}</AccessAlert>
        <Link href="/admin/restablecer" className={`mt-5 inline-block ${LINK}`}>
          Pedir un enlace nuevo
        </Link>
      </>
    );

  return (
    <>
      <p className="mt-3 text-text-body">
        Elige la contraseña con la que ingresarás al panel. Al guardarla se cierran las sesiones
        abiertas de tu cuenta.
      </p>
      {state.message ? <AccessAlert>{state.message}</AccessAlert> : null}
      <form action={action} aria-busy={pending} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <TextField
          label="Contraseña nueva"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          hint={PASSWORD_HINT}
          error={state.fieldErrors.password}
          required
        />
        <TextField
          label="Repite la contraseña"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          error={state.fieldErrors.confirmation}
          required
        />
        <Button type="submit" className="mt-1 w-full" disabled={pending}>
          {pending ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    </>
  );
}
