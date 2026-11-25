import type { Prisma } from "../../generated/prisma/client.js";
import type { Actor } from "../audit.js";

/**
 * Inventario de un pedido (RN-03, RN-04, RN-06; RF-34). Lo usa el cambio de
 * estado del panel (LN-13) y lo puede reutilizar el vencimiento automático
 * (LN-15). Siempre dentro de la transacción del llamador, con el pedido ya
 * bloqueado; cada variante se bloquea (FOR UPDATE, en orden de id para no
 * cruzarse con otra transacción) antes de moverla, como en los ajustes de LN-12.
 */

export interface MovedUnits {
  variantId: string;
  sku: string;
  quantity: number;
  movementId: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Quien mueve el inventario: alguien del panel o el sistema (vencimiento
 * automático de LN-15, con `actorUserId: null` y la etiqueta «Sistema»).
 */
export type MovementActor = Omit<Actor, "actorUserId"> & { actorUserId: string | null };

interface LockedVariant {
  id: string;
  sku: string;
  physical: number;
  reserved: number;
}

async function lockVariant(tx: Tx, variantId: string): Promise<LockedVariant> {
  const [variant] = await tx.$queryRaw<LockedVariant[]>`
    SELECT "id", "sku", "stock_physical" AS "physical", "stock_reserved" AS "reserved"
    FROM "product_variants"
    WHERE "id" = ${variantId}::uuid
    FOR UPDATE`;
  if (!variant) throw new Error("La variante de la reserva no existe");
  return variant;
}

/**
 * Libera las reservas activas o en revisión del pedido (vencer o cancelar sin
 * venta): baja el reservado, registra un movimiento `release` y deja la
 * reserva `released`. Liberar no toca el stock físico (RN-03).
 */
export async function releaseOrderReservations(
  tx: Tx,
  orderId: string,
  actor: MovementActor,
  reason: string,
  now = new Date(),
): Promise<MovedUnits[]> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, status: { in: ["active", "in_review"] } },
    orderBy: { variantId: "asc" },
  });
  const moved: MovedUnits[] = [];
  for (const reservation of reservations) {
    const variant = await lockVariant(tx, reservation.variantId);
    // Nunca deja el reservado negativo, aunque los datos vinieran descuadrados.
    const quantity = Math.min(reservation.quantity, variant.reserved);
    await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { status: "released", resolvedAt: now },
    });
    if (quantity === 0) continue;
    const updated = await tx.productVariant.update({
      where: { id: variant.id },
      data: { stockReserved: { decrement: quantity } },
    });
    const movement = await tx.inventoryMovement.create({
      data: {
        variantId: variant.id,
        kind: "release",
        physicalDelta: 0,
        reservedDelta: -quantity,
        physicalAfter: updated.stockPhysical,
        reservedAfter: updated.stockReserved,
        reason,
        orderId,
        ...actor,
      },
    });
    moved.push({ variantId: variant.id, sku: variant.sku, quantity, movementId: movement.id });
  }
  return moved;
}

/**
 * Reposición tras cancelar un pedido pagado (RN-06): las unidades que la venta
 * descontó (reservas `consumed`) vuelven al stock físico, con un movimiento
 * `restock` por variante. Se repone exactamente lo reservado y vendido: una
 * línea a pedido puede tener parte reservada (LN-09 reserva las unidades
 * terminadas y marca la línea a pedido por el resto), y solo esa parte vuelve;
 * lo fabricado a pedido nunca descontó stock. El llamador garantiza que se
 * registra una sola vez (`orders.restock_recorded_at`).
 */
export async function restockOrder(
  tx: Tx,
  orderId: string,
  actor: Actor,
  reason: string,
): Promise<MovedUnits[]> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, status: "consumed" },
    orderBy: { variantId: "asc" },
  });
  const moved: MovedUnits[] = [];
  for (const reservation of reservations) {
    const variant = await lockVariant(tx, reservation.variantId);
    const updated = await tx.productVariant.update({
      where: { id: variant.id },
      data: { stockPhysical: { increment: reservation.quantity } },
    });
    const movement = await tx.inventoryMovement.create({
      data: {
        variantId: variant.id,
        kind: "restock",
        physicalDelta: reservation.quantity,
        reservedDelta: 0,
        physicalAfter: updated.stockPhysical,
        reservedAfter: updated.stockReserved,
        reason,
        orderId,
        ...actor,
      },
    });
    moved.push({
      variantId: variant.id,
      sku: variant.sku,
      quantity: reservation.quantity,
      movementId: movement.id,
    });
  }
  return moved;
}
