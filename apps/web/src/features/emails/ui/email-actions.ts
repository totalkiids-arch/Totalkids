"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import { emailLog } from "../container";
import { emailQueryString, parseEmailQuery } from "../domain/email-log";

/*
 * Reenvío manual de un correo (RF-21). Solo Administrador (POST
 * /admin/emails/{id}/resend), aunque el Operador vea la pantalla: se comprueba
 * aquí porque la acción se puede invocar directamente, y la API lo vuelve a
 * exigir. La API registra quién lo pidió y no modifica el pedido ni la solicitud.
 * Funciona sin JavaScript (form + redirect con ?aviso=).
 */

const PATH = "/admin/correos";

const ResendForm = z.object({
  id: z.string().regex(/^[0-9a-f-]{36}$/i),
  volver: z.string().max(400).optional(),
});

function back(aviso: string, volver = "", extra: Record<string, string> = {}): Route {
  // Los filtros vuelven a pasar por el dominio: solo valores conocidos.
  const query = parseEmailQuery(Object.fromEntries(new URLSearchParams(volver)));
  const params = new URLSearchParams(emailQueryString(query).slice(1));
  params.set("aviso", aviso);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return `${PATH}?${params.toString()}${query.id ? "#detalle" : ""}` as Route;
}

export async function resendEmailAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  if (session.role !== "admin") redirect(back("sin-permiso"));

  const parsed = ResendForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(back("ilegible"));

  const { id, volver } = parsed.data;
  const result = await attemptPanel(() => emailLog.resend(id));
  revalidatePath(PATH);
  if (isPanelFailure(result)) redirect(back("error", volver));
  if (result.ok) redirect(back("reenviado", volver));
  if (result.reason === "rate-limited") {
    const minutes = Math.max(1, Math.ceil((result.retryAfterSeconds ?? 60) / 60));
    redirect(back("espera", volver, { minutos: String(minutes) }));
  }
  redirect(back(result.reason === "not-found" ? "no-existe" : "no-permitido", volver));
}
