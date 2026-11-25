"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";
import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import { STORE_THEME_TAG, storeThemeAdmin } from "../container";
import { isStoreThemeId } from "../domain/store-theme";

const PATH = "/admin/apariencia";

/** Guarda la plantilla tras verificar el rol también en el servidor. */
export async function setStoreThemeAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  if (!canAccessSection(session.role, "apariencia")) redirect("/admin");

  const parsed = z.object({ theme: z.string().max(40) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isStoreThemeId(parsed.data.theme)) redirect(`${PATH}?aviso=invalida`);

  const theme = parsed.data.theme;
  const saved = await attemptPanel(() => storeThemeAdmin.setActive(theme));
  if (isPanelFailure(saved)) redirect(`${PATH}?aviso=error`);
  // La plantilla se lee desde los layouts de la tienda y de la consulta de pedidos.
  updateTag(STORE_THEME_TAG);
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  redirect(`${PATH}?aviso=guardada`);
}
