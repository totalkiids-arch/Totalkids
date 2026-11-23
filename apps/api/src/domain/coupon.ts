/**
 * Cupones en el carrito (LN-06, RF-07, RN-01). Funciones puras.
 *
 * - Un cupón por carrito (no se acumulan).
 * - Vigencia por día calendario en Chile, ambos extremos inclusive.
 * - El porcentaje se redondea al peso más cercano; el descuento nunca supera
 *   el subtotal y no se aplica al despacho.
 * - El cupo se controla con `uses_count` (reservados + consumidos). En el
 *   carrito solo se verifica; la reserva atómica ocurre al crear el pedido.
 */

export interface CouponRow {
  code: string;
  kind: "percent" | "amount";
  value: number;
  /** AAAA-MM-DD (día en Chile). */
  startsOn: string;
  endsOn: string;
  maxUses: number;
  usesCount: number;
  active: boolean;
}

export type CouponRejection = "not_found" | "inactive" | "not_started" | "expired" | "exhausted";

export const COUPON_REJECTION_MESSAGE: Record<CouponRejection, string> = {
  not_found: "Ese cupón no existe. Revisa que esté bien escrito.",
  inactive: "Ese cupón no está disponible.",
  not_started: "Ese cupón todavía no está vigente.",
  expired: "Ese cupón ya venció.",
  exhausted: "Ese cupón ya alcanzó su máximo de usos.",
};

export type CouponCheck =
  | { ok: true; code: string; discount: number }
  | { ok: false; reason: CouponRejection; message: string };

/** Normaliza lo que escribe el comprador: mayúsculas y sin espacios. */
export function normalizeCouponCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** Descuento de un cupón sobre el subtotal (RN-01). */
export function couponDiscount(coupon: Pick<CouponRow, "kind" | "value">, subtotal: number) {
  const raw =
    coupon.kind === "percent" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  return Math.max(0, Math.min(raw, subtotal));
}

const reject = (reason: CouponRejection): CouponCheck => ({
  ok: false,
  reason,
  message: COUPON_REJECTION_MESSAGE[reason],
});

/**
 * ¿Se puede usar hoy el cupón con este subtotal?
 * @param today Día de hoy en Chile, AAAA-MM-DD (lo entrega quien llama).
 */
export function checkCoupon(
  coupon: CouponRow | null,
  subtotal: number,
  today: string,
): CouponCheck {
  if (!coupon) return reject("not_found");
  if (!coupon.active) return reject("inactive");
  if (today < coupon.startsOn) return reject("not_started");
  if (today > coupon.endsOn) return reject("expired");
  if (coupon.usesCount >= coupon.maxUses) return reject("exhausted");
  return { ok: true, code: coupon.code, discount: couponDiscount(coupon, subtotal) };
}
