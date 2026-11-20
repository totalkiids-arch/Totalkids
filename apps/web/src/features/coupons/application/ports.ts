import type { Coupon, CouponInput, FieldErrors } from "../domain/coupon";

export type CouponResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export type RemoveCouponResult = { ok: true } | { ok: false; reason: "not-found" | "in-use" };

/**
 * Puerto: cupones del panel (RF-07, RF-28). El adaptador valida con las reglas
 * del dominio; con la API (LN-12/LN-13, CRUD /admin/coupons), también las
 * aplica el backend, que además controla el cupo con compras simultáneas.
 */
export interface CouponAdmin {
  list(): Promise<Coupon[]>;
  /** id null crea un cupón nuevo (con 0 usos). */
  save(id: string | null, input: CouponInput): Promise<CouponResult<Coupon>>;
  /** null si el cupón ya no existe. */
  setActive(id: string, active: boolean): Promise<Coupon | null>;
  /** Solo un cupón sin usos se elimina; con usos, se desactiva. */
  remove(id: string): Promise<RemoveCouponResult>;
}
