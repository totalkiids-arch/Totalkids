"use server";

import { redirect } from "next/navigation";

import { lookupGuestOrder, type GuestLookupResult } from "../container";

/** Estado del formulario (useActionState). null = sin enviar. */
export type GuestLookupState =
  | (Extract<GuestLookupResult, { ok: false }> & { values: { pedido: string; correo: string } })
  | null;

/** Consulta un pedido invitado y, si coincide, abre su detalle. */
export async function lookupGuestOrderAction(
  _: GuestLookupState,
  formData: FormData,
): Promise<GuestLookupState> {
  const input = Object.fromEntries(formData);
  const result = await lookupGuestOrder(input);
  if (result.ok) redirect(`/seguimiento/${result.orderId}`);
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 254) : "");
  return { ...result, values: { pedido: text(input.pedido), correo: text(input.correo) } };
}
