import type { PaymentPage, PaymentQuery } from "../domain/payment-query";
import type { PaymentResolution, ReconcileOutcome } from "../domain/reconciliation";

/** Errores por campo de un formulario ("form" = mensaje general). */
export type FieldErrors = Partial<Record<string, string>>;

export type ResolveResult = { ok: true } | { ok: false; errors: FieldErrors };

export type ReconcileResult =
  { ok: true; outcome: ReconcileOutcome } | { ok: false; reason: "not-allowed" | "not-found" };

/**
 * Puerto: pagos del panel (RF-33). Lo implementa la API: GET /admin/payments
 * (Administrador y Operador), «Consultar en Flow» (POST …/reconcile, ambos
 * roles) y la resolución manual con motivo (POST …/resolve, solo
 * Administrador). La API autoriza, aplica las reglas y audita con el actor de
 * la sesión; 403 o la API caída se lanzan como PanelApiError.
 */
export interface AdminPayments {
  list(query: PaymentQuery): Promise<PaymentPage>;
  /** Consulta el estado real en Flow y lo asienta (idempotente). */
  reconcile(id: string): Promise<ReconcileResult>;
  resolve(id: string, input: { action: PaymentResolution; reason: string }): Promise<ResolveResult>;
}
