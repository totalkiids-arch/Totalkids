"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { ADMIN_ROLE_LABEL, canAccessSection } from "@/features/users";

import { serviceRequestAdmin } from "../../container";
import {
  NOTE_MAX,
  parseRequestQuery,
  requestQueryString,
  type FollowUpErrors,
} from "../../domain/service-request-admin";

/*
 * Seguimiento de solicitudes (RF-24, RF-29). Administrador y Operador
 * (sección "solicitudes", tabla de la API de la SRS). La acción:
 * 1. comprueba la sesión DEMO y el rol, aunque se invoque sin la pantalla;
 * 2. valida la forma con zod;
 * 3. delega en el puerto, que valida con el dominio. El actor sale de la sesión.
 * Funciona sin JavaScript (useActionState + redirect con ?aviso=).
 */

const FORBIDDEN = "Tu sesión no puede gestionar solicitudes. Vuelve a ingresar al panel.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";
const PATH = "/admin/solicitudes";

export interface FollowUpFormState {
  values: { status: string; note: string };
  errors: FollowUpErrors;
}

const FollowUpForm = z.object({
  id: z.string().regex(/^SOL-[A-Z0-9]{1,20}$/),
  status: z.string().max(40),
  // El dominio aplica el máximo exacto y muestra el error junto al campo.
  note: z.string().max(NOTE_MAX * 2),
  filters: z.string().max(200),
});

export async function saveRequestFollowUpAction(
  previous: FollowUpFormState,
  formData: FormData,
): Promise<FollowUpFormState> {
  const session = await getAdminSession();
  if (!session || !canAccessSection(session.role, "solicitudes")) {
    return { ...previous, errors: { form: FORBIDDEN } };
  }
  const parsed = FollowUpForm.safeParse({
    id: formData.get("id") ?? "",
    status: formData.get("status") ?? "",
    note: formData.get("note") ?? "",
    filters: formData.get("filters") ?? "",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };

  const { id, status, note, filters } = parsed.data;
  const result = await serviceRequestAdmin.followUp(
    id,
    { status, note },
    ADMIN_ROLE_LABEL[session.role],
  );
  if (!result.ok) return { values: { status, note }, errors: result.errors };

  revalidatePath(PATH);
  // Los filtros vuelven a pasar por el dominio: solo valores conocidos.
  const query = requestQueryString(
    parseRequestQuery(Object.fromEntries(new URLSearchParams(filters))),
  );
  const params = new URLSearchParams(query.slice(1));
  params.set("id", id);
  params.set("aviso", "seguimiento");
  redirect(`${PATH}?${params.toString()}#detalle`);
}
