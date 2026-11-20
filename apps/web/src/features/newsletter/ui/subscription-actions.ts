"use server";

import { subscribe, unsubscribe } from "../container";

/** Estado de cada formulario (useActionState). null = sin enviar. */
export type SubscriptionFormState =
  | { ok: true; email: string }
  | { ok: false; errors: { correo?: string; consentimiento?: string }; email: string }
  | null;

const typedEmail = (formData: FormData) => String(formData.get("correo") ?? "").slice(0, 254);

export async function subscribeAction(
  _: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  const result = await subscribe(Object.fromEntries(formData));
  return result.ok
    ? { ok: true, email: result.email }
    : { ok: false, errors: result.errors, email: typedEmail(formData) };
}

export async function unsubscribeAction(
  _: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  const result = await unsubscribe(Object.fromEntries(formData));
  return result.ok
    ? { ok: true, email: result.email }
    : { ok: false, errors: result.errors, email: typedEmail(formData) };
}
