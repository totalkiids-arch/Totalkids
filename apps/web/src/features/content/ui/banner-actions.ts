"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";

import { bannerAdmin } from "../container";
import type { FieldErrors } from "../domain/banner";

/*
 * Mutaciones de Banners. Cada acción comprueba el rol (sesión DEMO, ver
 * features/auth) porque una acción se puede invocar sin pasar por la pantalla,
 * valida la forma con zod y delega las reglas en el puerto (que usa el dominio).
 * Los formularios funcionan sin JavaScript (useActionState + redirect).
 */

const FORBIDDEN = "Tu rol no puede modificar banners. Ingresa como Administrador.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";
const PATH = "/admin/banners";

async function canEdit() {
  const session = await getAdminSession();
  return Boolean(session && canAccessSection(session.role, "banners"));
}

const str = (max: number) => z.string().max(max);

export interface BannerFormValues {
  title: string;
  text: string;
  href: string;
  order: string;
  active: boolean;
}

export interface BannerFormState {
  values: BannerFormValues;
  errors: FieldErrors;
}

const BannerForm = z.object({
  id: str(40),
  title: str(500),
  text: str(1000),
  href: str(1000),
  order: str(20),
});

export async function saveBannerAction(
  previous: BannerFormState,
  formData: FormData,
): Promise<BannerFormState> {
  if (!(await canEdit())) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = BannerForm.safeParse({
    id: formData.get("id") ?? "",
    title: formData.get("title") ?? "",
    text: formData.get("text") ?? "",
    href: formData.get("href") ?? "",
    order: formData.get("order") ?? "",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };

  const { id, ...rest } = parsed.data;
  const values = { ...rest, active: formData.get("active") === "1" };
  const result = await bannerAdmin.save(id || null, values);
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath(PATH);
  redirect(`${PATH}?aviso=${id ? "guardado" : "creado"}`);
}

const ToggleForm = z.object({ id: str(40).min(1), active: z.enum(["0", "1"]) });

export async function toggleBannerAction(formData: FormData) {
  if (!(await canEdit())) redirect("/admin");
  const parsed = ToggleForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(PATH);

  const banner = await bannerAdmin.setActive(parsed.data.id, parsed.data.active === "1");
  revalidatePath(PATH);
  redirect(`${PATH}?aviso=${banner ? (banner.active ? "activado" : "desactivado") : "no-existe"}`);
}
