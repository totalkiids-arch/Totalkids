"use server";

import { confirmUnsubscribe, subscribe, unsubscribe } from "../container";

/** Estado de cada formulario (useActionState). null = sin enviar. */
export type SubscriptionFormState =
  | { ok: true; email: string }
  | {
      ok: false;
      errors: { correo?: string; consentimiento?: string };
      /** La API no aceptó el envío (caída o demasiados intentos). */
      formError?: string;
      email: string;
    }
  | null;

const typedEmail = (formData: FormData) => String(formData.get("correo") ?? "").slice(0, 254);

function toState(
  result: Awaited<ReturnType<typeof subscribe | typeof unsubscribe>>,
  formData: FormData,
): SubscriptionFormState {
  if (result.ok) return { ok: true, email: result.email };
  return {
    ok: false,
    errors: result.errors,
    ...("formError" in result ? { formError: result.formError } : {}),
    email: typedEmail(formData),
  };
}

export async function subscribeAction(
  _: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  return toState(await subscribe(Object.fromEntries(formData)), formData);
}

/** Pide el enlace de baja (llega por correo si el correo está suscrito). */
export async function unsubscribeAction(
  _: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  return toState(await unsubscribe(Object.fromEntries(formData)), formData);
}

/** Estado de la confirmación de baja. null = sin confirmar. */
export type ConfirmUnsubscribeState =
  { status: "done" } | { status: "invalid" } | { status: "error"; message: string } | null;

/** Confirma la baja con el token del enlace (botón de la página de baja). */
export async function confirmUnsubscribeAction(
  _: ConfirmUnsubscribeState,
  formData: FormData,
): Promise<ConfirmUnsubscribeState> {
  const result = await confirmUnsubscribe(String(formData.get("token") ?? ""));
  if (result.ok) return { status: "done" };
  return "formError" in result
    ? { status: "error", message: result.formError }
    : { status: "invalid" };
}
