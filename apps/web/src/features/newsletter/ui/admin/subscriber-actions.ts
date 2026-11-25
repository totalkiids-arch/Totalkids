"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";
import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import { subscriberAdmin } from "../../container";
import { parseSubscriberQuery, toSubscriberSearch } from "../../domain/subscriber";

/*
 * Baja de suscriptor desde el panel (RF-29, RF-35). Solo Administrador
 * (sección "suscriptores"): se comprueba aquí aunque la acción se invoque sin la
 * pantalla, y la API lo vuelve a exigir. No borra el registro; la API guarda
 * la fecha y el rol de quien la registró. Funciona sin JavaScript (form + redirect).
 */

const PATH = "/admin/suscriptores";

const UnsubscribeForm = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/),
  volver: z.string().max(400).optional(),
});

/** Vuelve al listado con sus filtros (releídos por el dominio: solo valores conocidos). */
function back(aviso: string, volver = ""): Route {
  const query = parseSubscriberQuery(Object.fromEntries(new URLSearchParams(volver)));
  return `${PATH}${toSubscriberSearch(query, { aviso })}` as Route;
}

export async function unsubscribeSubscriberAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  if (!canAccessSection(session.role, "suscriptores")) redirect(back("sin-permiso"));

  const parsed = UnsubscribeForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(back("ilegible"));

  const { id, volver } = parsed.data;
  const result = await attemptPanel(() => subscriberAdmin.registerUnsubscribe(id));
  revalidatePath(PATH);
  if (isPanelFailure(result)) redirect(back("error", volver));
  if (result.ok) redirect(back("baja", volver));
  redirect(back(result.reason === "not-found" ? "no-existe" : "ya-de-baja", volver));
}
