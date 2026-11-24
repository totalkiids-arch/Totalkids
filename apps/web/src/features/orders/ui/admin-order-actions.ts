"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";
import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import { adminOrderPanel } from "../container";
import type { FieldErrors } from "../domain/admin-order";
import { normalizeOrderId } from "../domain/guest-lookup";

/*
 * Mutaciones del panel de pedidos. Cada acción:
 * 1. comprueba la sesión y el rol: la pantalla ya oculta lo que no corresponde,
 *    pero una acción se puede invocar directamente. Reembolsos y corrección de
 *    folio son solo del Administrador (y la API lo vuelve a exigir);
 * 2. valida la forma del formulario con zod;
 * 3. delega en la API, que aplica las reglas y registra el actor de la sesión.
 * Las reglas de negocio vuelven por campo; 403 o la API caída, como mensaje.
 * Los formularios funcionan sin JavaScript (useActionState + redirect).
 */

const FORBIDDEN = "Tu sesión no puede gestionar pedidos. Vuelve a ingresar al panel.";
const ADMIN_ONLY_REFUND = "Solo el Administrador registra reembolsos manuales.";
const ADMIN_ONLY_INVOICE = "Solo el Administrador corrige el folio de una factura registrada.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";

async function currentRole() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  return session.role;
}

async function canManageOrders() {
  return canAccessSection(await currentRole(), "pedidos");
}

const str = (max: number) => z.string().max(max);

/** Revalida las vistas que muestran el pedido. */
function revalidateOrder(ref: string) {
  revalidatePath(`/admin/pedidos/${ref}`);
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/pagos");
  revalidatePath("/admin");
}

/** "$30.000", "30 000" o "30000" → 30000; cualquier otra cosa → NaN (la API lo rechaza). */
function parseClp(text: string): number {
  const clean = text.replace(/[$.\s]/g, "");
  return /^\d{1,12}$/.test(clean) ? Number(clean) : Number.NaN;
}

// ── Cambio de estado (RF-27, RF-34) ──────────────────────────────────────────

export interface StatusFormState {
  values: { to: string; reason: string; carrier: string; code: string; restock: boolean };
  errors: FieldErrors;
}

const StatusForm = z.object({
  id: str(40),
  to: str(40),
  reason: str(2000),
  carrier: str(200),
  code: str(200),
  restock: z.boolean(),
});

export async function changeOrderStatusAction(
  previous: StatusFormState,
  formData: FormData,
): Promise<StatusFormState> {
  if (!(await canManageOrders())) return { ...previous, errors: { form: FORBIDDEN } };

  const parsed = StatusForm.safeParse({
    id: formData.get("id") ?? "",
    to: formData.get("to") ?? "",
    reason: formData.get("reason") ?? "",
    carrier: formData.get("carrier") ?? "",
    code: formData.get("code") ?? "",
    restock: formData.get("restock") === "1",
  });
  const ref = parsed.success ? normalizeOrderId(parsed.data.id) : null;
  if (!parsed.success || !ref) return { ...previous, errors: { form: UNREADABLE } };

  const { to, reason, carrier, code, restock } = parsed.data;
  const values = { to, reason, carrier, code, restock };
  const result = await attemptPanel(() => adminOrderPanel.changeStatus(ref, values));
  if (isPanelFailure(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidateOrder(ref);
  redirect(`/admin/pedidos/${ref}?aviso=estado#historial`);
}

// ── Reembolso manual (RF-32), solo Administrador ────────────────────────────

export interface RefundFormState {
  values: { amount: string; date: string; reference: string; status: string };
  errors: FieldErrors;
}

const RefundForm = z.object({
  id: str(40),
  amount: str(40),
  date: str(20),
  reference: str(500),
  status: str(20),
});

export async function registerRefundAction(
  previous: RefundFormState,
  formData: FormData,
): Promise<RefundFormState> {
  if ((await currentRole()) !== "admin")
    return { ...previous, errors: { form: ADMIN_ONLY_REFUND } };

  const parsed = RefundForm.safeParse(Object.fromEntries(formData));
  const ref = parsed.success ? normalizeOrderId(parsed.data.id) : null;
  if (!parsed.success || !ref) return { ...previous, errors: { form: UNREADABLE } };

  const { amount, date, reference, status } = parsed.data;
  const values = { amount, date, reference, status };
  const result = await attemptPanel(() =>
    adminOrderPanel.registerRefund(ref, { amount: parseClp(amount), date, reference, status }),
  );
  if (isPanelFailure(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidateOrder(ref);
  redirect(`/admin/pedidos/${ref}?aviso=reembolso#reembolso`);
}

const ResolveRefund = z.object({
  id: str(40),
  refundId: str(80),
  status: z.enum(["processed", "failed"]),
});

/** Marca un reembolso solicitado como procesado o fallido (botones, sin JavaScript). */
export async function resolveRefundAction(formData: FormData) {
  const parsed = ResolveRefund.safeParse(Object.fromEntries(formData));
  const ref = parsed.success ? normalizeOrderId(parsed.data.id) : null;
  if (!parsed.success || !ref) redirect("/admin/pedidos");

  if ((await currentRole()) !== "admin")
    redirect(`/admin/pedidos/${ref}?aviso=sin-permiso#reembolso`);

  const result = await attemptPanel(() =>
    adminOrderPanel.resolveRefund(ref, parsed.data.refundId, parsed.data.status),
  );
  revalidateOrder(ref);
  const ok = !isPanelFailure(result) && result.ok;
  redirect(
    `/admin/pedidos/${ref}?aviso=${ok ? "reembolso-resuelto" : "reembolso-no-resuelto"}#reembolso`,
  );
}

// ── Factura emitida por Total Kids ──────────────────────────────────────────

export interface InvoiceFormState {
  values: { number: string; reason: string };
  errors: FieldErrors;
}

const InvoiceForm = z.object({
  id: str(40),
  number: str(40),
  reason: str(2000),
  replace: z.boolean(),
});

/**
 * Registra el folio de la factura que Total Kids emitió (Flow solo cubre la
 * boleta), o lo corrige: corregir es solo del Administrador, con motivo.
 */
export async function registerInvoiceAction(
  previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const role = await currentRole();
  if (!canAccessSection(role, "pedidos")) return { ...previous, errors: { form: FORBIDDEN } };

  const parsed = InvoiceForm.safeParse({
    id: formData.get("id") ?? "",
    number: formData.get("number") ?? "",
    reason: formData.get("reason") ?? "",
    replace: formData.get("replace") === "1",
  });
  const ref = parsed.success ? normalizeOrderId(parsed.data.id) : null;
  if (!parsed.success || !ref) return { ...previous, errors: { form: UNREADABLE } };

  const { number, reason, replace } = parsed.data;
  const values = { number, reason };
  if (replace && role !== "admin") return { values, errors: { form: ADMIN_ONLY_INVOICE } };

  const result = await attemptPanel(() =>
    adminOrderPanel.registerInvoice(ref, { number, replace, reason }),
  );
  if (isPanelFailure(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidateOrder(ref);
  redirect(`/admin/pedidos/${ref}?aviso=${replace ? "factura-corregida" : "factura"}#facturacion`);
}
