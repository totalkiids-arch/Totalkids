"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode, type Ref } from "react";

import { Button, ButtonLink } from "@/shared/ui/button";
import { Checkbox, TextField } from "@/shared/ui/form";

import { AUTH_FIELDS as F, PASSWORD_MIN, type AuthField } from "../domain/credentials";
import {
  loginAction,
  recoverAction,
  registerAction,
  resetPasswordAction,
  type AuthFormState,
} from "./auth-actions";

type Action = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

/**
 * Estado común de los formularios: errores por campo, lo escrito (sin
 * contraseñas) y foco en el primer error o en el mensaje general.
 */
function useAuthForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, null);
  const failed = state && !state.ok ? state : null;
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      doneRef.current?.focus();
      return;
    }
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? alertRef.current)?.focus();
  }, [state]);

  const field = (name: AuthField) => ({
    name,
    defaultValue: failed?.values[name] ?? "",
    error: failed?.errors[name],
  });

  const alert = failed?.message ? (
    <p
      ref={alertRef}
      tabIndex={-1}
      role="alert"
      className="rounded-2xl bg-soft-red px-4 py-3 font-bold text-brand-red-deep"
    >
      {failed.message}
    </p>
  ) : null;

  return { state, formAction, pending, formRef, doneRef, field, alert, failed };
}

function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" className="min-h-13 w-full" disabled={pending}>
      {pending ? "Un momento…" : children}
    </Button>
  );
}

function Done({ doneRef, children }: { doneRef: Ref<HTMLParagraphElement>; children: ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <p ref={doneRef} tabIndex={-1} className="rounded-2xl bg-soft-green px-4 py-3 font-bold">
        {children}
      </p>
    </div>
  );
}

export function LoginForm() {
  const { formAction, pending, formRef, field, alert } = useAuthForm(loginAction);
  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {alert}
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
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
        {...field(F.password)}
        defaultValue={undefined}
      />
      <Submit pending={pending}>Entrar a mi cuenta</Submit>
    </form>
  );
}

export function RegisterForm() {
  const { formAction, pending, formRef, field, alert, failed } = useAuthForm(registerAction);
  const privacyError = failed?.errors[F.privacy];
  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {alert}
      <TextField
        label="Nombre completo"
        autoComplete="name"
        placeholder="Camila González"
        required
        maxLength={120}
        {...field(F.name)}
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
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        hint={`Al menos ${PASSWORD_MIN} caracteres.`}
        required
        minLength={PASSWORD_MIN}
        maxLength={128}
        {...field(F.password)}
        defaultValue={undefined}
      />
      <div>
        <Checkbox
          name={F.privacy}
          required
          aria-invalid={privacyError ? true : undefined}
          aria-describedby={privacyError ? "registro-privacidad-error" : undefined}
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
        {privacyError ? (
          <p id="registro-privacidad-error" className="text-sm font-bold text-brand-red">
            {privacyError}
          </p>
        ) : null}
      </div>
      <Submit pending={pending}>Crear mi cuenta</Submit>
    </form>
  );
}

export function RecoverForm() {
  const { state, formAction, pending, formRef, doneRef, field, alert } = useAuthForm(recoverAction);
  if (state?.ok) {
    return (
      <Done doneRef={doneRef}>
        Si existe una cuenta con ese correo, te enviamos un enlace para elegir una nueva contraseña.
        Revisa también la carpeta de spam.
      </Done>
    );
  }
  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {alert}
      <p className="text-text-body">
        Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una nueva contraseña.
      </p>
      <TextField
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        placeholder="nombre@correo.cl"
        required
        maxLength={254}
        {...field(F.email)}
      />
      <Submit pending={pending}>Enviar enlace</Submit>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { state, formAction, pending, formRef, doneRef, field, alert, failed } =
    useAuthForm(resetPasswordAction);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-3">
        <Done doneRef={doneRef}>Listo: ya puedes ingresar con tu nueva contraseña.</Done>
        <ButtonLink href="/ingresar" size="lg">
          Iniciar sesión
        </ButtonLink>
      </div>
    );
  }
  const tokenError = failed?.errors[F.token];
  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {alert}
      {tokenError ? (
        <p role="alert" className="rounded-2xl bg-soft-red px-4 py-3 font-bold text-brand-red-deep">
          {tokenError}{" "}
          <Link href="/recuperar" className="underline">
            Pedir un enlace nuevo
          </Link>
        </p>
      ) : null}
      <input type="hidden" name={F.token} value={token} />
      <TextField
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        hint={`Al menos ${PASSWORD_MIN} caracteres.`}
        required
        minLength={PASSWORD_MIN}
        maxLength={128}
        {...field(F.password)}
        defaultValue={undefined}
      />
      <TextField
        label="Repite tu contraseña"
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        {...field(F.confirm)}
        defaultValue={undefined}
      />
      <Submit pending={pending}>Guardar contraseña</Submit>
    </form>
  );
}
