"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";
import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import { bannerAdmin, STORE_BANNERS_TAG } from "../container";
import type { FieldErrors } from "../domain/banner";

/*
 * Mutaciones de Banners. Cada acción comprueba el rol (una acción se puede
 * invocar sin pasar por la pantalla, y la API vuelve a autorizar), valida la
 * forma con zod y delega en el puerto (la API). Cada cambio invalida la caché
 * de la portada. Los formularios funcionan sin JavaScript (useActionState + redirect).
 */

const FORBIDDEN = "Tu rol no puede modificar banners. Ingresa como Administrador.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";
const PATH = "/admin/banners";

async function canEdit() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  return canAccessSection(session.role, "banners");
}

/** La portada guarda los banners 60 s: un cambio del panel se ve de inmediato. */
function refreshStore() {
  updateTag(STORE_BANNERS_TAG);
  revalidatePath("/");
}

const str = (max: number) => z.string().max(max);

export interface BannerFormValues {
  title: string;
  text: string;
  href: string;
  order: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
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
  startsAt: str(40),
  endsAt: str(40),
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
    startsAt: formData.get("startsAt") ?? "",
    endsAt: formData.get("endsAt") ?? "",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };

  const { id, ...rest } = parsed.data;
  const values = { ...rest, active: formData.get("active") === "1" };
  const result = await attemptPanel(() => bannerAdmin.save(id || null, values));
  if (isPanelFailure(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath(PATH);
  refreshStore();
  redirect(`${PATH}?aviso=${id ? "guardado" : "creado"}`);
}

const ToggleForm = z.object({ id: str(40).min(1), active: z.enum(["0", "1"]) });

export async function toggleBannerAction(formData: FormData) {
  if (!(await canEdit())) redirect("/admin");
  const parsed = ToggleForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(PATH);

  const banner = await attemptPanel(() =>
    bannerAdmin.setActive(parsed.data.id, parsed.data.active === "1"),
  );
  revalidatePath(PATH);
  refreshStore();
  const notice = isPanelFailure(banner)
    ? "error"
    : banner
      ? banner.active
        ? "activado"
        : "desactivado"
      : "no-existe";
  redirect(`${PATH}?aviso=${notice}`);
}
