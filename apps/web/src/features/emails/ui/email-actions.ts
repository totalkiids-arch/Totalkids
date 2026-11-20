"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { ADMIN_ROLE_LABEL } from "@/features/users";

import { emailLog } from "../container";
import { emailQueryString, parseEmailQuery } from "../domain/email-log";

/*
 * Reenvío manual de un correo (RF-21). Solo Administrador (tabla de la API de
 * la SRS: POST /admin/emails/{id}/resend), aunque el Operador vea la pantalla:
 * se comprueba aquí porque la acción se puede invocar directamente. El actor
 * sale de la sesión. No modifica el pedido. SIMULADO: no se envía nada.
 * Funciona sin JavaScript (form + redirect con ?aviso=).
 */

const PATH = "/admin/correos";

const ResendForm = z.object({
  id: z.string().regex(/^E-\d{1,10}$/),
  evento: z.string().max(40).optional(),
  estado: z.string().max(40).optional(),
  pedido: z.string().max(40).optional(),
});

function back(aviso: string, filters: Record<string, string | undefined>, id?: string): Route {
  // Los filtros vuelven a pasar por el dominio: solo valores conocidos.
  const query = parseEmailQuery(filters);
  const params = new URLSearchParams(emailQueryString({ ...query, id: id ?? null }).slice(1));
  params.set("aviso", aviso);
  return `${PATH}?${params.toString()}${id ? "#detalle" : ""}` as Route;
}

export async function resendEmailAction(formData: FormData) {
  const session = await getAdminSession();
  if (session?.role !== "admin") redirect(back("sin-permiso", {}));

  const parsed = ResendForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(back("ilegible", {}));

  const { id, ...filters } = parsed.data;
  const result = await emailLog.resend(id, ADMIN_ROLE_LABEL[session.role]);
  revalidatePath(PATH);
  redirect(back(result.ok ? "reenviado" : "no-permitido", filters, id));
}
