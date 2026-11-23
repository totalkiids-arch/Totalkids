import type { Coupon, Prisma } from "../generated/prisma/client.js";
import type { CouponKind } from "../generated/prisma/enums.js";
import { chileDate, dateOnly } from "./cart/chile-date.js";

/**
 * Cupones (RF-07, RN-01): uno por carrito o pedido, de porcentaje o monto, con
 * vigencia en días de Chile (inclusive) y máximo de usos. El descuento se
 * calcula solo sobre el subtotal elegible (productos y extras, nunca el
 * despacho), el porcentaje se redondea al peso y nunca supera ese subtotal.
 */

/** Mensajes de la tienda (apps/web, coupon-form): iguales para todo rechazo. */
export const COUPON_EMPTY_MESSAGE = "Escribe el código de tu cupón.";
export const couponRejectedMessage = (code: string) =>
  `El cupón «${code.slice(0, 30)}» no existe o ya no está vigente.`;
export const couponAppliedMessage = (code: string) => `Cupón «${code}» aplicado.`;
export const couponDroppedMessage = (code: string) =>
  `El cupón «${code}» ya no está vigente y no se aplica.`;

export type CouponRejection = "not_found" | "inactive" | "not_started" | "expired" | "exhausted";

/** Mayúsculas y sin espacios, como se guarda (`coupons_code_format`). */
export function normalizeCouponCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export type CouponRules = Pick<
  Coupon,
  "kind" | "value" | "startsOn" | "endsOn" | "maxUses" | "usesCount" | "active"
>;

/** ¿Se puede usar hoy (día de Chile)? Devuelve el motivo si no. */
export function couponRejection(
  coupon: CouponRules | null,
  today = chileDate(),
): CouponRejection | null {
  if (!coupon) return "not_found";
  if (!coupon.active) return "inactive";
  if (today < dateOnly(coupon.startsOn)) return "not_started";
  if (today > dateOnly(coupon.endsOn)) return "expired";
  if (coupon.usesCount >= coupon.maxUses) return "exhausted";
  return null;
}

/**
 * Descuento en CLP sobre el subtotal elegible (RN-01). Porcentaje redondeado al
 * peso más cercano (0,5 hacia arriba); nunca mayor que el subtotal elegible.
 */
export function couponDiscount(
  coupon: { kind: CouponKind; value: number },
  eligibleSubtotal: number,
): number {
  const base = Math.max(0, Math.trunc(eligibleSubtotal));
  const raw =
    coupon.kind === "percent" ? Math.floor((base * coupon.value + 50) / 100) : coupon.value;
  return Math.min(Math.max(0, raw), base);
}

// ─── Usos del cupón en pedidos (LN-09, LN-15) ─────────────────────────────────

/** El cupón ya no se puede usar (cupo lleno, vencido o inactivo) al reservar. */
export class CouponUnavailableError extends Error {
  constructor() {
    super("El cupón ya no está disponible");
    this.name = "CouponUnavailableError";
  }
}

/**
 * Reserva un uso del cupón para un pedido, dentro de la transacción que crea el
 * pedido (RF-07). El UPDATE es condicional (`uses_count < max_uses`, activo y
 * vigente hoy en Chile): con compras simultáneas, PostgreSQL bloquea la fila y
 * vuelve a evaluar la condición sobre el valor ya confirmado, así que nunca se
 * supera `max_uses`. Sin cupo lanza `CouponUnavailableError`.
 */
export async function reserveCouponUse(
  tx: Prisma.TransactionClient,
  input: { couponId: string; orderId: string; discount: number },
  now = new Date(),
) {
  if (!Number.isInteger(input.discount) || input.discount < 0) {
    throw new RangeError("El descuento debe ser un entero en CLP mayor o igual a 0");
  }
  const today = chileDate(now);
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE coupons
    SET uses_count = uses_count + 1, updated_at = now()
    WHERE id = ${input.couponId}::uuid
      AND active
      AND uses_count < max_uses
      AND starts_on <= ${today}::date
      AND ends_on >= ${today}::date
    RETURNING id`;
  if (rows.length === 0) throw new CouponUnavailableError();
  return tx.couponRedemption.create({
    data: { couponId: input.couponId, orderId: input.orderId, discount: input.discount },
  });
}

/**
 * Consume el uso reservado al confirmarse el pago. Idempotente: devuelve false
 * si no había una reserva vigente (ya consumida, liberada o inexistente).
 */
export async function consumeCouponUse(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<boolean> {
  const { count } = await tx.couponRedemption.updateMany({
    where: { orderId, status: "reserved" },
    data: { status: "consumed" },
  });
  return count > 0;
}

/**
 * Libera el uso reservado si el pedido vence o se cancela antes de pagar, y
 * devuelve el cupo. Idempotente: solo descuenta una vez, aunque se llame dos
 * veces a la par. Un uso ya consumido no se libera.
 */
export async function releaseCouponUse(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<boolean> {
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (redemption?.status !== "reserved") return false;
  const { count } = await tx.couponRedemption.updateMany({
    where: { id: redemption.id, status: "reserved" },
    data: { status: "released" },
  });
  if (count === 0) return false;
  await tx.$executeRaw`
    UPDATE coupons
    SET uses_count = uses_count - 1, updated_at = now()
    WHERE id = ${redemption.couponId}::uuid AND uses_count > 0`;
  return true;
}
