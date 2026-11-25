import type { PrismaClient } from "../src/lib/prisma.js";

/**
 * Limpieza de los tests con conexiones reales (LN-17): las transacciones se
 * confirman de verdad para probar la concurrencia, así que cada archivo borra
 * lo que creó. Sigue el orden de las claves foráneas (todas Restrict). Las filas
 * de audit_log quedan: la tabla solo admite inserciones, igual que en los demás
 * tests; global-setup.ts la vacía con TRUNCATE al empezar la corrida.
 */
export async function deleteOrders(prisma: PrismaClient, orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  const where = { orderId: { in: orderIds } };
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { idempotencyKey: true },
  });
  const emails = await prisma.emailLog.findMany({ where, select: { id: true, eventKey: true } });
  const emailIds = emails.map((e) => e.id);
  await prisma.emailAttempt.deleteMany({ where: { emailId: { in: emailIds } } });
  await prisma.emailLog.deleteMany({ where: { id: { in: emailIds } } });
  await prisma.outboxJob.deleteMany({ where: { eventKey: { in: emails.map((e) => e.eventKey) } } });
  await prisma.couponRedemption.deleteMany({ where });
  await prisma.inventoryMovement.deleteMany({ where });
  await prisma.stockReservation.deleteMany({ where });
  await prisma.orderStatusHistory.deleteMany({ where });
  await prisma.orderItemExtra.deleteMany({ where: { orderItem: where } });
  await prisma.orderItem.deleteMany({ where });
  await prisma.refundRecord.deleteMany({ where });
  await prisma.payment.deleteMany({ where });
  await prisma.idempotencyRecord.deleteMany({
    where: { key: { in: orders.map((o) => o.idempotencyKey) } },
  });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
}

/** Pedidos con alguna línea de esos productos (los crea la API, no el test). */
export async function ordersOfProducts(
  prisma: PrismaClient,
  productIds: string[],
): Promise<string[]> {
  const rows = await prisma.order.findMany({
    where: { items: { some: { variant: { productId: { in: productIds } } } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Borra productos (con sus variantes, movimientos sueltos y carritos que los
 * contienen) y sus categorías. Llamar después de deleteOrders.
 */
export async function deleteProducts(
  prisma: PrismaClient,
  productIds: string[],
  categoryIds: string[] = [],
): Promise<void> {
  const variantWhere = { variant: { productId: { in: productIds } } };
  await prisma.inventoryMovement.deleteMany({ where: variantWhere });
  await prisma.cart.deleteMany({ where: { items: { some: variantWhere } } });
  await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  if (categoryIds.length > 0) {
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  }
}
