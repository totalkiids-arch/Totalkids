"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form";

import { AccessAlert } from "./access-frame";
import { signInAction, type SignInState } from "./admin-session-actions";

/** Correo y contraseña del equipo. Los errores los decide la API (mismo mensaje en todos los casos). */
export function AdminLoginForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {
    email: "",
    fieldErrors: {},
  });

  return (
    <>
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
        <TextField
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={1024}
          error={state.fieldErrors.password}
          required
        />
        <Button type="submit" className="mt-1 w-full" disabled={pending}>
          {pending ? "Ingresando…" : "Ingresar"}
        </Button>
        <Link
          href="/admin/restablecer"
          className="self-center text-sm font-bold text-brand-blue underline-offset-4 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </>
  );
}
