"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { ADMIN_ROLE_LABEL, canAccessSection } from "@/features/users";

import { subscriberAdmin } from "../../container";
import { parseSubscriberQuery } from "../../domain/subscriber";

/*
 * Baja de suscriptor desde el panel (RF-29, RF-35). Solo Administrador
 * (sección "suscriptores"): se comprueba aquí aunque la acción se invoque sin la
 * pantalla. No borra el registro. Funciona sin JavaScript (form + redirect).
 */

const PATH = "/admin/suscriptores";

const UnsubscribeForm = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/),
  estado: z.string().max(20).optional(),
});

function back(aviso: string, estado?: string): Route {
  const params = new URLSearchParams();
  const filter = parseSubscriberQuery({ estado }).filter;
  if (filter) params.set("estado", filter);
  params.set("aviso", aviso);
  return `${PATH}?${params.toString()}` as Route;
}

export async function unsubscribeSubscriberAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session || !canAccessSection(session.role, "suscriptores")) redirect(back("sin-permiso"));

  const parsed = UnsubscribeForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(back("ilegible"));

  const result = await subscriberAdmin.registerUnsubscribe(
    parsed.data.id,
    ADMIN_ROLE_LABEL[session.role],
  );
  revalidatePath(PATH);
  if (result.ok) redirect(back("baja", parsed.data.estado));
  redirect(back(result.reason === "not-found" ? "no-existe" : "ya-de-baja", parsed.data.estado));
}
