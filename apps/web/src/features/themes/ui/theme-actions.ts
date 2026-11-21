"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";

import { storeThemeAdmin } from "../container";
import { isStoreThemeId } from "../domain/store-theme";

const PATH = "/admin/apariencia";

/** Guarda la plantilla tras verificar el rol también en el servidor. */
export async function setStoreThemeAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session || !canAccessSection(session.role, "apariencia")) redirect("/admin");

  const parsed = z.object({ theme: z.string().max(40) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isStoreThemeId(parsed.data.theme)) redirect(`${PATH}?aviso=invalida`);

  await storeThemeAdmin.setActive(parsed.data.theme);
  // La plantilla se lee desde los layouts de tienda y cuenta.
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  redirect(`${PATH}?aviso=guardada`);
}
