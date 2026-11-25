"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection } from "@/features/users";
import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import type { FieldErrors } from "../application/ports";
import { reconcilePaymentAttempt, resolvePaymentAttempt } from "../container";
import {
  isPaymentResolution,
  RESOLUTION_REASON_MAX,
  RESOLUTION_REASON_MIN,
} from "../domain/reconciliation";

/*
 * Conciliación de pagos desde el panel (LN-15, RF-33). Cada acción comprueba
 * la sesión y el rol aunque la pantalla ya oculte lo que no corresponde (una
 * acción se puede invocar directamente) y la API lo vuelve a exigir:
 * - «Consultar en Flow»: Administrador y Operador (sección Pagos).
 * - Resolución manual con motivo: solo Administrador.
 * Funcionan sin JavaScript (form + redirect con ?aviso=).
 */

const FORBIDDEN = "Solo el Administrador resuelve pagos a mano.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";

/** Solo se vuelve a Pagos (con sus filtros) o al detalle de un pedido. */
const BACK = /^\/admin\/(pagos(\?[\w=&%.-]{0,300})?|pedidos\/TK-\d{1,10})$/;

const Id = z.string().regex(/^[0-9a-f-]{36}$/i);

function back(volver: string, aviso: string, hash = ""): Route {
  const url = new URL(BACK.test(volver) ? volver : "/admin/pagos", "http://panel.local");
  url.searchParams.set("aviso", aviso);
  return `${url.pathname}${url.search}${hash}` as Route;
}

function revalidatePayments(volver: string) {
  revalidatePath("/admin/pagos");
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
  if (BACK.test(volver) && volver.startsWith("/admin/pedidos/")) revalidatePath(volver);
}

// ── Consultar en Flow (Administrador y Operador) ─────────────────────────────

const ReconcileForm = z.object({ id: Id, volver: z.string().max(400) });

export async function reconcilePaymentAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  const parsed = ReconcileForm.safeParse({
    id: formData.get("id") ?? "",
    volver: formData.get("volver") ?? "",
  });
  const volver = parsed.success ? parsed.data.volver : "";
  if (!canAccessSection(session.role, "pagos")) redirect(back(volver, "sin-permiso"));
  if (!parsed.success) redirect(back(volver, "error-flow"));

  const result = await attemptPanel(() => reconcilePaymentAttempt(parsed.data.id));
  revalidatePayments(volver);
  if (isPanelFailure(result)) redirect(back(volver, "error-flow"));
  if (!result.ok) redirect(back(volver, "no-conciliable"));
  redirect(back(volver, result.outcome));
}

// ── Resolución manual (solo Administrador) ───────────────────────────────────

export interface ResolveFormState {
  values: { action: string; reason: string };
  errors: FieldErrors;
}

const ResolveForm = z.object({
  id: Id,
  action: z.string().max(40),
  reason: z.string().max(2000),
  volver: z.string().max(400),
});

export async function resolvePaymentAction(
  previous: ResolveFormState,
  formData: FormData,
): Promise<ResolveFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  if (session.role !== "admin") return { ...previous, errors: { form: FORBIDDEN } };

  const parsed = ResolveForm.safeParse({
    id: formData.get("id") ?? "",
    action: formData.get("action") ?? "",
    reason: formData.get("reason") ?? "",
    volver: formData.get("volver") ?? "",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };
  const { id, action, reason, volver } = parsed.data;
  const values = { action, reason };

  // Lo mismo que valida la API, para responder sin ir a la red.
  const errors: FieldErrors = {};
  if (!isPaymentResolution(action)) errors.action = "Elige cómo resolver el pago.";
  const trimmed = reason.trim();
  if (trimmed.length < RESOLUTION_REASON_MIN) {
    errors.reason = "Escribe el motivo de la resolución (mínimo 3 caracteres).";
  } else if (trimmed.length > RESOLUTION_REASON_MAX) {
    errors.reason = `El motivo admite hasta ${String(RESOLUTION_REASON_MAX)} caracteres.`;
  }
  if (Object.keys(errors).length > 0 || !isPaymentResolution(action)) return { values, errors };

  const result = await attemptPanel(() => resolvePaymentAttempt(id, { action, reason: trimmed }));
  if (isPanelFailure(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidatePayments(volver);
  redirect(back(volver, "resuelto", volver.startsWith("/admin/pedidos/") ? "#pago" : ""));
}
