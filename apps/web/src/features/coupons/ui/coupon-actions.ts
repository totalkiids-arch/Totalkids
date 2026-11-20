"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";

import { couponAdmin } from "../container";
import type { FieldErrors } from "../domain/coupon";

/*
 * Mutaciones de Cupones. Cada acción comprueba el rol (sesión DEMO, ver
 * features/auth) porque una acción se puede invocar sin pasar por la pantalla,
 * valida la forma con zod y delega las reglas en el puerto (que usa el dominio).
 * Los formularios funcionan sin JavaScript (useActionState + redirect).
 */

const FORBIDDEN = "Tu rol no puede modificar cupones. Ingresa como Administrador.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";
const PATH = "/admin/cupones";

async function canEdit() {
  const session = await getAdminSession();
  return Boolean(session && canAccessSection(session.role, "cupones"));
}

const str = (max: number) => z.string().max(max);

export interface CouponFormValues {
  code: string;
  kind: string;
  value: string;
  startsOn: string;
  endsOn: string;
  maxUses: string;
  active: boolean;
}

export interface CouponFormState {
  values: CouponFormValues;
  errors: FieldErrors;
}

const CouponForm = z.object({
  id: str(40),
  code: str(200),
  kind: str(20),
  value: str(40),
  startsOn: str(20),
  endsOn: str(20),
  maxUses: str(40),
});

export async function saveCouponAction(
  previous: CouponFormState,
  formData: FormData,
): Promise<CouponFormState> {
  if (!(await canEdit())) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = CouponForm.safeParse({
    id: formData.get("id") ?? "",
    code: formData.get("code") ?? "",
    kind: formData.get("kind") ?? "",
    value: formData.get("value") ?? "",
    startsOn: formData.get("startsOn") ?? "",
    endsOn: formData.get("endsOn") ?? "",
    maxUses: formData.get("maxUses") ?? "",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };

  const { id, ...rest } = parsed.data;
  const values = { ...rest, active: formData.get("active") === "1" };
  const result = await couponAdmin.save(id || null, values);
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath(PATH);
  redirect(`${PATH}?aviso=${id ? "guardado" : "creado"}`);
}

const IdForm = z.object({ id: str(40).min(1) });
const ToggleForm = IdForm.extend({ active: z.enum(["0", "1"]) });

export async function toggleCouponAction(formData: FormData) {
  if (!(await canEdit())) redirect("/admin");
  const parsed = ToggleForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(PATH);

  const coupon = await couponAdmin.setActive(parsed.data.id, parsed.data.active === "1");
  revalidatePath(PATH);
  redirect(`${PATH}?aviso=${coupon ? (coupon.active ? "activado" : "desactivado") : "no-existe"}`);
}

export async function deleteCouponAction(formData: FormData) {
  if (!(await canEdit())) redirect("/admin");
  const parsed = IdForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(PATH);

  const result = await couponAdmin.remove(parsed.data.id);
  revalidatePath(PATH);
  if (result.ok) redirect(`${PATH}?aviso=eliminado`);
  redirect(`${PATH}?aviso=${result.reason === "in-use" ? "con-usos" : "no-existe"}`);
}
