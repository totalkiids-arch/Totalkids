"use server";

import { redirect } from "next/navigation";

import {
  login,
  logout,
  register,
  requestRecovery,
  resetPassword,
  type AuthResult,
} from "../container";
import { pickSafeValues, type AuthErrors, type AuthField } from "../domain/credentials";

/** Estado de los formularios de cuenta (useActionState). null = sin enviar. */
export type AuthFormState =
  | { ok: true }
  | {
      ok: false;
      errors: AuthErrors;
      message: string | null;
      /** Lo escrito, sin contraseñas, para volver a llenar el formulario. */
      values: Partial<Record<AuthField, string>>;
    }
  | null;

function failed(result: Extract<AuthResult, { ok: false }>, input: Record<string, unknown>) {
  return {
    ok: false as const,
    errors: result.errors,
    message: result.message ?? null,
    values: pickSafeValues(input),
  };
}

export async function loginAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = Object.fromEntries(formData);
  const result = await login(input);
  if (!result.ok) return failed(result, input);
  redirect("/cuenta/pedidos");
}

export async function registerAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = Object.fromEntries(formData);
  const result = await register(input);
  if (!result.ok) return failed(result, input);
  redirect("/cuenta/pedidos");
}

export async function recoverAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = Object.fromEntries(formData);
  const result = await requestRecovery(input);
  return result.ok ? result : failed(result, input);
}

export async function resetPasswordAction(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = Object.fromEntries(formData);
  const result = await resetPassword(input);
  return result.ok ? result : failed(result, input);
}

/** Cierra la sesión y vuelve a "Iniciar sesión". */
export async function logoutAction() {
  await logout();
  redirect("/ingresar");
}
