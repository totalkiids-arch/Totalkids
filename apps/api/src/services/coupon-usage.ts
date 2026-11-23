import type { Db } from "./cart-store.js";

/**
 * Reserva y consumo de usos de cupón (LN-06 para LN-09, RF-07). Operaciones
 * atómicas para usar DENTRO de la transacción que crea, paga o anula el pedido.
 *
 * El cupo se controla con un UPDATE condicional: `uses_count` solo sube si
 * sigue bajo `max_uses` (y el cupón está activo y vigente). Con compras
 * simultáneas, PostgreSQL serializa ese UPDATE sobre la fila: nunca se supera
 * el máximo (además, el CHECK coupons_uses_within_max lo garantiza).
 *
 *   reservado ──pago confirmado──▶ consumido
 *       └──vencido o cancelado──▶ liberado (devuelve el uso)
 */

export type ReserveResult = { ok: true; redemptionId: string } | { ok: false; reason: "exhausted" };

/**
 * Reserva un uso para el pedido. Falla si el cupón ya no está activo, vigente
 * o con cupo en este momento.
 * @param today Día de hoy en Chile (AAAA-MM-DD).
 */
export async function reserveCouponUse(
  db: Db,
  input: { couponId: string; orderId: string; discount: number; today: string },
): Promise<ReserveResult> {
  const taken = await db.$executeRaw`
    UPDATE "coupons"
       SET "uses_count" = "uses_count" + 1, "updated_at" = now()
     WHERE "id" = ${input.couponId}::uuid
       AND "active"
       AND "uses_count" < "max_uses"
       AND "starts_on" <= ${input.today}::date
       AND "ends_on" >= ${input.today}::date`;
  if (taken !== 1) return { ok: false, reason: "exhausted" };

  const redemption = await db.couponRedemption.create({
    data: { couponId: input.couponId, orderId: input.orderId, discount: input.discount },
  });
  return { ok: true, redemptionId: redemption.id };
}

/**
 * El pedido se pagó: el uso reservado pasa a consumido (no cambia el cupo).
 * Devuelve false si el pedido no tenía un uso reservado.
 */
export async function consumeCouponUse(db: Db, orderId: string): Promise<boolean> {
  const { count } = await db.couponRedemption.updateMany({
    where: { orderId, status: "reserved" },
    data: { status: "consumed" },
  });
  return count === 1;
}

/**
 * El pedido venció o se canceló sin pago: se libera el uso y vuelve al cupo.
 * Idempotente: liberar dos veces no devuelve el uso dos veces.
 */
export async function releaseCouponUse(db: Db, orderId: string): Promise<boolean> {
  const redemption = await db.couponRedemption.findUnique({ where: { orderId } });
  if (!redemption || redemption.status !== "reserved") return false;
  const { count } = await db.couponRedemption.updateMany({
    where: { id: redemption.id, status: "reserved" },
    data: { status: "released" },
  });
  if (count !== 1) return false;
  await db.$executeRaw`
    UPDATE "coupons"
       SET "uses_count" = "uses_count" - 1, "updated_at" = now()
     WHERE "id" = ${redemption.couponId}::uuid AND "uses_count" > 0`;
  return true;
}
