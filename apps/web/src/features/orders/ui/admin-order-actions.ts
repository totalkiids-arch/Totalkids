"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import type { ReconcileFormState } from "@/features/payments";
import { ADMIN_ROLE_LABEL, canAccessSection, type AdminSection } from "@/features/users";

import { adminOrderPanel } from "../container";
import { normalizeOrderId } from "../domain/guest-lookup";
import type { FieldErrors } from "../domain/order-workflow";

/*
 * Mutaciones del panel de pedidos y pagos. Cada acción:
 * 1. comprueba la sesión (DEMO, ver features/auth) y el rol: la pantalla ya
 *    oculta lo que no corresponde, pero una acción se puede invocar directamente.
 *    El reembolso manual es solo del Administrador (tabla de la API de la SRS);
 * 2. valida la forma del formulario con zod;
 * 3. delega en el puerto AdminOrderPanel, que valida con las reglas del dominio.
 *    El actor sale de la sesión, nunca del formulario.
 * Los formularios funcionan sin JavaScript (useActionState + redirect).
 */

const FORBIDDEN = "Tu sesión no puede gestionar pedidos. Vuelve a ingresar al panel.";
const FORBIDDEN_REFUND = "Solo el Administrador registra reembolsos manuales.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";

async function sessionFor(section: AdminSection) {
  const session = await getAdminSession();
  return session && canAccessSection(session.role, section) ? session : null;
}

async function adminSession() {
  const session = await getAdminSession();
  return session?.role === "admin" ? session : null;
}

const str = (max: number) => z.string().max(max);

/** Revalida todas las vistas que muestran el pedido. */
function revalidateOrder(id: string) {
  revalidatePath(`/admin/pedidos/${id}`);
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/pagos");
  revalidatePath("/admin");
  revalidatePath(`/cuenta/pedidos/${id}`);
}

/** "$30.000", "30 000" o "30000" → 30000; cualquier otra cosa → NaN (el dominio lo rechaza). */
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
  const session = await sessionFor("pedidos");
  if (!session) return { ...previous, errors: { form: FORBIDDEN } };

  const parsed = StatusForm.safeParse({
    id: formData.get("id") ?? "",
    to: formData.get("to") ?? "",
    reason: formData.get("reason") ?? "",
    carrier: formData.get("carrier") ?? "",
    code: formData.get("code") ?? "",
    restock: formData.get("restock") === "1",
  });
  const id = parsed.success ? normalizeOrderId(parsed.data.id) : null;
  if (!parsed.success || !id) return { ...previous, errors: { form: UNREADABLE } };

  const { to, reason, carrier, code, restock } = parsed.data;
  const values = { to, reason, carrier, code, restock };
  const result = await adminOrderPanel.changeStatus(id, values, ADMIN_ROLE_LABEL[session.role]);
  if (!result.ok) return { values, errors: result.errors };

  revalidateOrder(id);
  redirect(`/admin/pedidos/${id}?aviso=estado#historial`);
}

// ── Reembolso manual (RF-32) ─────────────────────────────────────────────────

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
  const session = await adminSession();
  if (!session) return { ...previous, errors: { form: FORBIDDEN_REFUND } };

  const parsed = RefundForm.safeParse(Object.fromEntries(formData));
  const id = parsed.success ? normalizeOrderId(parsed.data.id) : null;
  if (!parsed.success || !id) return { ...previous, errors: { form: UNREADABLE } };

  const { amount, date, reference, status } = parsed.data;
  const values = { amount, date, reference, status };
  const result = await adminOrderPanel.registerRefund(
    id,
    { amount: parseClp(amount), date, reference, status },
    ADMIN_ROLE_LABEL[session.role],
  );
  if (!result.ok) return { values, errors: result.errors };

  revalidateOrder(id);
  redirect(`/admin/pedidos/${id}?aviso=reembolso#reembolso`);
}

const ResolveRefund = z.object({
  id: str(40),
  refundId: str(80),
  status: z.enum(["processed", "failed"]),
});

/** Marca un reembolso solicitado como procesado o fallido (botones, sin JavaScript). */
export async function resolveRefundAction(formData: FormData) {
  const parsed = ResolveRefund.safeParse(Object.fromEntries(formData));
  const id = parsed.success ? normalizeOrderId(parsed.data.id) : null;
  if (!parsed.success || !id) redirect("/admin/pedidos");

  const session = await adminSession();
  if (!session) redirect(`/admin/pedidos/${id}?aviso=sin-permiso#reembolso`);

  const result = await adminOrderPanel.resolveRefund(
    id,
    { refundId: parsed.data.refundId, status: parsed.data.status },
    ADMIN_ROLE_LABEL[session.role],
  );
  revalidateOrder(id);
  redirect(
    `/admin/pedidos/${id}?aviso=${result.ok ? "reembolso-resuelto" : "reembolso-no-resuelto"}#reembolso`,
  );
}

// ── Factura emitida por Total Kids ──────────────────────────────────────────

const InvoiceForm = z.object({ id: str(40), number: str(20) });

/**
 * Registra el folio de la factura que Total Kids emitió (Flow solo cubre la
 * boleta). Quien gestiona pedidos puede hacerlo; queda en el historial.
 */
export async function registerInvoiceAction(formData: FormData) {
  const parsed = InvoiceForm.safeParse(Object.fromEntries(formData));
  const id = parsed.success ? normalizeOrderId(parsed.data.id) : null;
  if (!parsed.success || !id) redirect("/admin/pedidos");

  const session = await sessionFor("pedidos");
  if (!session) redirect(`/admin/pedidos/${id}?aviso=factura-sin-permiso#facturacion`);

  const result = await adminOrderPanel.registerInvoice(
    id,
    { number: parsed.data.number },
    ADMIN_ROLE_LABEL[session.role],
  );
  revalidateOrder(id);
  redirect(`/admin/pedidos/${id}?aviso=${result.ok ? "factura" : "factura-invalida"}#facturacion`);
}

// ── Conciliación con Flow (RF-33), la usa la pantalla de Pagos ──────────────

const ReconcileForm = z.object({
  order: str(40),
  result: str(20),
  reason: str(2000),
});

const RESULT_NOTICE: Record<string, string> = {
  paid: "pagado",
  rejected: "rechazado",
  uncertain: "incierto",
};

export async function reconcilePaymentAction(
  previous: ReconcileFormState,
  formData: FormData,
): Promise<ReconcileFormState> {
  const session = await sessionFor("pagos");
  if (!session) return { ...previous, errors: { form: FORBIDDEN } };

  const parsed = ReconcileForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };
  const values = parsed.data;
  const id = normalizeOrderId(values.order);
  if (!id)
    return { values, errors: { order: "Elige un pedido con pago pendiente o en revisión." } };

  const result = await adminOrderPanel.reconcile(
    id,
    { result: values.result, reason: values.reason },
    ADMIN_ROLE_LABEL[session.role],
  );
  if (!result.ok) return { values, errors: result.errors };

  revalidateOrder(id);
  redirect(`/admin/pagos?aviso=${RESULT_NOTICE[values.result] ?? "consultado"}&pedido=${id}`);
}
