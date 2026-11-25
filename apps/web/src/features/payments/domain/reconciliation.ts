/**
 * Conciliación de pagos con Flow en el panel (LN-15; RF-33, RN-04 a RN-06).
 * Dominio puro: tipos y textos. Las reglas las aplica la API: ella dice qué
 * intento se puede consultar (`reconcilable`) y qué resoluciones admite
 * (`resolutions`); aquí no se repiten.
 */

/** Resoluciones manuales de un pago en revisión (solo Administrador). */
export const PAYMENT_RESOLUTIONS = ["release", "refund_pending", "confirm"] as const;
export type PaymentResolution = (typeof PAYMENT_RESOLUTIONS)[number];

export function isPaymentResolution(value: unknown): value is PaymentResolution {
  return typeof value === "string" && (PAYMENT_RESOLUTIONS as readonly string[]).includes(value);
}

export const RESOLUTION_LABEL: Record<PaymentResolution, string> = {
  release: "Liberar: Flow no cobró",
  refund_pending: "Reembolso pendiente",
  confirm: "Confirmar con stock disponible",
};

/** Qué hace cada resolución, para el formulario. */
export const RESOLUTION_HELP: Record<PaymentResolution, string> = {
  release:
    "Revisado en Flow sin cobro: el intento queda anulado y el pedido vence, liberando el stock y el cupón.",
  refund_pending:
    "Hubo cobro que no se puede aplicar: se devuelve a mano. Si es el pago del pedido, el pedido se cancela y la devolución se registra con un reembolso manual.",
  confirm:
    "Pago tardío y ya hay stock: se descuenta, se confirma el pedido y se avisa al comprador.",
};

/** Motivo de la revisión (alertas del resumen y correo al equipo). */
export const REVIEW_REASONS = [
  "late_no_stock",
  "double_charge",
  "mismatch",
  "flow_unreachable",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  late_no_stock: "Pago tardío sin stock",
  double_charge: "Doble cobro",
  mismatch: "Datos del pago distintos",
  flow_unreachable: "Flow sin respuesta",
};

/** Resultado de «Consultar en Flow» (POST /admin/payments/{id}/reconcile). */
export const RECONCILE_OUTCOMES = [
  "unknown",
  "unchanged",
  "confirmed",
  "late_review",
  "rejected",
  "mismatch",
  "double_charge",
  "not_open",
  "waiting",
  "expired",
  "uncertain",
  "in_review",
] as const;
export type ReconcileOutcome = (typeof RECONCILE_OUTCOMES)[number];

export type NoticeTone = "success" | "info" | "warning";

/** Avisos de la pantalla tras consultar o resolver (?aviso=…). */
export const RECONCILE_NOTICES: Record<string, { message: string; tone: NoticeTone }> = {
  confirmed: { message: "Flow confirmó el pago: el pedido quedó confirmado.", tone: "success" },
  rejected: {
    message: "Flow informó el pago rechazado o anulado: se liberó lo reservado.",
    tone: "info",
  },
  expired: {
    message: "Flow confirmó que no hubo cobro: el pedido venció y se liberó el stock.",
    tone: "info",
  },
  waiting: {
    message: "Flow informa el pago pendiente: se volverá a consultar automáticamente.",
    tone: "info",
  },
  unchanged: { message: "Consultado en Flow: el pago no cambió.", tone: "info" },
  uncertain: {
    message:
      "Flow no respondió con certeza: no se asume rechazo y se volverá a consultar automáticamente.",
    tone: "warning",
  },
  in_review: {
    message:
      "Flow no respondió con certeza: el pago quedó en revisión y se avisó al equipo. No se vence mientras pueda haber un cobro.",
    tone: "warning",
  },
  late_review: {
    message:
      "Flow confirmó un pago tardío sin stock: el pedido quedó en revisión. Resuélvelo desde el pedido.",
    tone: "warning",
  },
  double_charge: {
    message: "Flow confirmó un segundo cobro: quedó en revisión, sin segunda entrega.",
    tone: "warning",
  },
  mismatch: {
    message: "Los datos de Flow no coinciden con el intento: quedó en revisión.",
    tone: "warning",
  },
  not_open: { message: "Este intento ya no está pendiente ni en revisión.", tone: "info" },
  unknown: { message: "Flow no reconoce este intento: se volverá a consultar.", tone: "warning" },
  resuelto: {
    message: "Pago resuelto. La resolución y su motivo quedaron en el historial.",
    tone: "success",
  },
  "no-conciliable": {
    message: "Solo se consulta en Flow el último intento pendiente o en revisión.",
    tone: "warning",
  },
  "error-flow": {
    message: "No pudimos consultar el pago. Inténtalo de nuevo en unos minutos.",
    tone: "warning",
  },
};

/** Motivo de la resolución: mismos límites que la API. */
export const RESOLUTION_REASON_MIN = 3;
export const RESOLUTION_REASON_MAX = 500;
