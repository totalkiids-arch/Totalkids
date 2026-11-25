import type { Coupon, CouponInput, FieldErrors } from "../domain/coupon";

export type CouponResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export type RemoveCouponResult = { ok: true } | { ok: false; reason: "not-found" | "in-use" };

/** Cupones con el día de hoy en Chile con que la API calculó su estado. */
export interface CouponList {
  today: string;
  /** Activos primero y luego por código (orden de la API). */
  coupons: Coupon[];
}

/**
 * Puerto: cupones del panel (RF-07, RF-28). Lo implementa la API
 * (/admin/coupons, solo Administrador), que aplica las reglas, controla el cupo
 * con compras simultáneas y registra el cambio. Las reglas de negocio vuelven
 * como errores por campo; 403 o la API caída se lanzan como PanelApiError.
 */
export interface CouponAdmin {
  list(): Promise<CouponList>;
  /** id null crea un cupón nuevo (con 0 usos). */
  save(id: string | null, input: CouponInput): Promise<CouponResult<Coupon>>;
  /** null si el cupón ya no existe. */
  setActive(id: string, active: boolean): Promise<Coupon | null>;
  /** Solo un cupón sin usos se elimina; con usos, se desactiva. */
  remove(id: string): Promise<RemoveCouponResult>;
}
