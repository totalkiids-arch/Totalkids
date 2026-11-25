import type { Prisma } from "../../generated/prisma/client.js";
import type { InventoryMovementKind } from "../../generated/prisma/enums.js";

/**
 * Stock de un pedido según su pago (RN-03 a RN-05). Siempre dentro de la
 * transacción del llamador y con el pedido bloqueado; las variantes se bloquean
 * en orden de id, igual que en LN-09 y LN-13 (sin deadlocks).
 */
type Tx = Prisma.TransactionClient;

/** Actor de los cambios automáticos. */
export const SYSTEM_ACTOR = "Sistema";

/** Reservas del pedido, con sus variantes bloqueadas, y si alcanza para retomar las liberadas. */
async function lockReservations(tx: Tx, orderId: string) {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, status: { not: "consumed" } },
    orderBy: { variantId: "asc" },
  });
  let available = true;
  for (const r of reservations) {
    const [v] = await tx.$queryRaw<{ physical: number; reserved: number }[]>`
      SELECT "stock_physical" AS "physical", "stock_reserved" AS "reserved"
      FROM "product_variants" WHERE "id" = ${r.variantId}::uuid FOR UPDATE`;
    if (!v) throw new Error("La variante de la reserva no existe");
    if (r.status === "released" && v.physical - v.reserved < r.quantity) available = false;
  }
  return { reservations, available };
}

interface MoveInput {
  orderId: string;
  variantId: string;
  kind: InventoryMovementKind;
  physicalDelta: number;
  reservedDelta: number;
  reason: string;
}

/** Quien registra el movimiento: por defecto el sistema (Flow, vencimientos). */
export interface StockActor {
  actorUserId: string | null;
  actorLabel: string;
}

const SYSTEM: StockActor = { actorUserId: null, actorLabel: SYSTEM_ACTOR };

async function move(tx: Tx, input: MoveInput, actor: StockActor = SYSTEM) {
  const variant = await tx.productVariant.update({
    where: { id: input.variantId },
    data: {
      stockPhysical: { increment: input.physicalDelta },
      stockReserved: { increment: input.reservedDelta },
    },
  });
  await tx.inventoryMovement.create({
    data: {
      ...input,
      physicalAfter: variant.stockPhysical,
      reservedAfter: variant.stockReserved,
      ...actor,
    },
  });
}

/**
 * Venta: descuenta el stock de las reservas. Si alguna ya se había liberado
 * (pago tardío, RN-05) la retoma solo si alcanza para TODAS; si no, no mueve
 * nada y devuelve false.
 */
export async function consumeReservations(
  tx: Tx,
  orderId: string,
  reason: string,
  now: Date,
  actor: StockActor = SYSTEM,
): Promise<boolean> {
  const { reservations, available } = await lockReservations(tx, orderId);
  if (!available) return false;
  for (const r of reservations) {
    await tx.stockReservation.update({
      where: { id: r.id },
      data: { status: "consumed", resolvedAt: now },
    });
    await move(
      tx,
      {
        orderId,
        variantId: r.variantId,
        kind: "sale",
        physicalDelta: -r.quantity,
        reservedDelta: r.status === "released" ? 0 : -r.quantity,
        reason,
      },
      actor,
    );
  }
  return true;
}

/** Reintento tras un rechazo: vuelve a reservar lo liberado, o false si no alcanza. */
export async function reserveAgain(
  tx: Tx,
  orderId: string,
  reason: string,
  expiresAt: Date,
): Promise<boolean> {
  const { reservations, available } = await lockReservations(tx, orderId);
  if (!available) return false;
  for (const r of reservations.filter((r) => r.status === "released")) {
    await tx.stockReservation.update({
      where: { id: r.id },
      data: { status: "active", resolvedAt: null, expiresAt },
    });
    await move(tx, {
      orderId,
      variantId: r.variantId,
      kind: "reservation",
      physicalDelta: 0,
      reservedDelta: r.quantity,
      reason,
    });
  }
  return true;
}

/** Rechazo o anulación confirmados: libera lo reservado (RF-18). */
export async function releaseReservations(tx: Tx, orderId: string, reason: string, now: Date) {
  const { reservations } = await lockReservations(tx, orderId);
  for (const r of reservations.filter((r) => r.status !== "released")) {
    await tx.stockReservation.update({
      where: { id: r.id },
      data: { status: "released", resolvedAt: now },
    });
    await move(tx, {
      orderId,
      variantId: r.variantId,
      kind: "release",
      physicalDelta: 0,
      reservedDelta: -r.quantity,
      reason,
    });
  }
}
