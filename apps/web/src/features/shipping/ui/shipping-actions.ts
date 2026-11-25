"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";
import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import { shippingAdmin } from "../container";
import type { FieldErrors } from "../domain/shipping-zone";

/*
 * Mutaciones de Despacho y retiro. Cada acción comprueba el rol (una acción se
 * puede invocar sin pasar por la pantalla, y la API vuelve a autorizar), valida
 * la forma con zod y delega en el puerto (la API).
 * Los formularios funcionan sin JavaScript (useActionState + redirect).
 */

const FORBIDDEN = "Tu rol no puede modificar el despacho. Ingresa como Administrador.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";

async function canEdit() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  return canAccessSection(session.role, "despacho");
}

const str = (max: number) => z.string().max(max);

// ── Zonas ────────────────────────────────────────────────────────────────────

export interface ZoneFormValues {
  region: string;
  commune: string;
  price: string;
  leadTime: string;
  freeShippingEligible: boolean;
  active: boolean;
}

export interface ZoneFormState {
  values: ZoneFormValues;
  errors: FieldErrors;
}

const ZoneForm = z.object({
  id: str(40),
  region: str(10),
  commune: str(500),
  price: str(40),
  leadTime: str(500),
});

export async function saveZoneAction(
  previous: ZoneFormState,
  formData: FormData,
): Promise<ZoneFormState> {
  if (!(await canEdit())) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = ZoneForm.safeParse({
    id: formData.get("id") ?? "",
    region: formData.get("region") ?? "",
    commune: formData.get("commune") ?? "",
    price: formData.get("price") ?? "",
    leadTime: formData.get("leadTime") ?? "",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };

  const { id, ...rest } = parsed.data;
  const values = {
    ...rest,
    freeShippingEligible: formData.get("freeShippingEligible") === "1",
    active: formData.get("active") === "1",
  };
  const result = await attemptPanel(() => shippingAdmin.saveZone(id || null, values));
  if (isPanelFailure(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/admin/despacho");
  redirect(`/admin/despacho?aviso=${id ? "zona-guardada" : "zona-creada"}`);
}

const ToggleZone = z.object({ id: str(40), active: z.enum(["0", "1"]) });

export async function toggleZoneAction(formData: FormData) {
  if (!(await canEdit())) redirect("/admin");
  const parsed = ToggleZone.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/despacho");

  const zone = await attemptPanel(() =>
    shippingAdmin.setZoneActive(parsed.data.id, parsed.data.active === "1"),
  );
  revalidatePath("/admin/despacho");
  const notice = isPanelFailure(zone)
    ? "error"
    : zone
      ? zone.active
        ? "zona-activada"
        : "zona-desactivada"
      : "no-existe";
  redirect(`/admin/despacho?aviso=${notice}`);
}

// ── Condiciones generales ────────────────────────────────────────────────────

export interface SettingsFormValues {
  pickupEnabled: boolean;
  pickup: string;
  freeShippingThreshold: string;
  reservationMinutes: string;
}

export interface SettingsFormState {
  values: SettingsFormValues;
  errors: FieldErrors;
}

const SettingsForm = z.object({
  pickup: str(1000),
  freeShippingThreshold: str(40),
  reservationMinutes: str(40),
});

export async function saveSettingsAction(
  previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  if (!(await canEdit())) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = SettingsForm.safeParse({
    pickup: formData.get("pickup") ?? "",
    freeShippingThreshold: formData.get("freeShippingThreshold") ?? "",
    reservationMinutes: formData.get("reservationMinutes") ?? "",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };

  const values = { ...parsed.data, pickupEnabled: formData.get("pickupEnabled") === "1" };
  const result = await attemptPanel(() => shippingAdmin.saveSettings(values));
  if (isPanelFailure(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/admin/despacho");
  redirect("/admin/despacho?aviso=condiciones-guardadas#condiciones");
}
