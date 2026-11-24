import type { InventoryMovementKind } from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import { pageMeta, pageWindow, type PageMeta, type Pagination } from "../../lib/pagination.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { writeAudit, type Actor } from "../audit.js";
import { available, Issues } from "./common.js";
import type { StockAdjustmentInput } from "./schemas.js";

/**
 * Inventario del panel (LN-12, RF-34, RN-03). Un ajuste fija el nuevo stock
 * físico de una variante con un motivo obligatorio. La fila de la variante se
 * bloquea (SELECT … FOR UPDATE) durante la transacción: un ajuste y una reserva
 * (o dos ajustes) simultáneos se aplican uno tras otro y ninguno se pierde.
 * Nunca deja el físico por debajo de lo reservado.
 */

export interface InventoryMovementDto {
  id: string;
  createdAt: string;
  kind: InventoryMovementKind;
  variantId: string;
  sku: string;
  physicalBefore: number;
  physicalAfter: number;
  physicalDelta: number;
  reservedBefore: number;
  reservedAfter: number;
  reservedDelta: number;
  reason: string;
  orderId: string | null;
  /** Rol al momento ("Administrador") y, si fue una persona, su nombre. */
  actorLabel: string;
  actorName: string | null;
}

export interface StockAdjustmentResult {
  variant: {
    id: string;
    sku: string;
    stockPhysical: number;
    stockReserved: number;
    available: number;
  };
  movement: InventoryMovementDto;
}

interface MovementRow {
  id: string;
  createdAt: Date;
  kind: InventoryMovementKind;
  variantId: string;
  physicalDelta: number;
  reservedDelta: number;
  physicalAfter: number;
  reservedAfter: number;
  reason: string;
  orderId: string | null;
  actorLabel: string;
  actor: { name: string } | null;
  variant: { sku: string };
}

function toDto(m: MovementRow): InventoryMovementDto {
  return {
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    kind: m.kind,
    variantId: m.variantId,
    sku: m.variant.sku,
    physicalBefore: m.physicalAfter - m.physicalDelta,
    physicalAfter: m.physicalAfter,
    physicalDelta: m.physicalDelta,
    reservedBefore: m.reservedAfter - m.reservedDelta,
    reservedAfter: m.reservedAfter,
    reservedDelta: m.reservedDelta,
    reason: m.reason,
    orderId: m.orderId,
    actorLabel: m.actorLabel,
    actorName: m.actor?.name ?? null,
  };
}

const movementInclude = {
  actor: { select: { name: true } },
  variant: { select: { sku: true } },
} as const;

export function adjustStock(
  prisma: Pick<PrismaClient, "$transaction">,
  productId: string,
  input: StockAdjustmentInput,
  actor: Actor,
  requestId?: string,
): Promise<StockAdjustmentResult> {
  return prisma.$transaction(async (tx) => {
    const [variant] = await tx.$queryRaw<
      { id: string; sku: string; physical: number; reserved: number }[]
    >`
      SELECT "id", "sku", "stock_physical" AS "physical", "stock_reserved" AS "reserved"
      FROM "product_variants"
      WHERE "id" = ${input.variantId}::uuid AND "product_id" = ${productId}::uuid
      FOR UPDATE`;
    if (!variant) throw errors.notFound("La variante no existe en este producto");

    const issues = new Issues();
    if (input.stockPhysical < variant.reserved) {
      issues.add(
        "stockPhysical",
        `El stock físico no puede ser menor que las ${String(variant.reserved)} unidades reservadas.`,
      );
    } else if (input.stockPhysical === variant.physical) {
      issues.add(
        "stockPhysical",
        `El stock físico ya es ${String(variant.physical)}: no hay nada que ajustar.`,
      );
    }
    issues.throwIfAny();

    const delta = input.stockPhysical - variant.physical;
    const updated = await tx.productVariant.update({
      where: { id: variant.id },
      data: { stockPhysical: input.stockPhysical },
    });
    const movement = await tx.inventoryMovement.create({
      data: {
        variantId: variant.id,
        kind: "adjustment",
        physicalDelta: delta,
        reservedDelta: 0,
        physicalAfter: updated.stockPhysical,
        reservedAfter: updated.stockReserved,
        reason: input.reason,
        ...actor,
      },
      include: movementInclude,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "inventory.adjusted",
        resourceType: "product_variant",
        resourceId: variant.id,
        details: {
          productId,
          sku: variant.sku,
          movementId: movement.id,
          stockPhysical: { before: variant.physical, after: updated.stockPhysical },
          stockReserved: updated.stockReserved,
        },
        reason: input.reason,
      },
      requestId,
    );
    return {
      variant: {
        id: updated.id,
        sku: updated.sku,
        stockPhysical: updated.stockPhysical,
        stockReserved: updated.stockReserved,
        available: available(updated),
      },
      movement: toDto(movement),
    };
  });
}

/** Historial de movimientos del producto (o de una de sus variantes), más reciente primero. */
export async function listMovements(
  prisma: Pick<PrismaClient, "product" | "inventoryMovement">,
  productId: string,
  query: Pagination & { variantId?: string | undefined },
): Promise<{ items: InventoryMovementDto[]; meta: PageMeta }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw errors.notFound("Producto no encontrado");

  const where = {
    variant: { productId },
    ...(query.variantId ? { variantId: query.variantId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      include: movementInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageWindow(query),
    }),
  ]);
  return { items: rows.map(toDto), meta: pageMeta(total, query) };
}

export interface InventoryRowDto {
  variantId: string;
  sku: string;
  optionLabel: string | null;
  variantActive: boolean;
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: "draft" | "active" | "inactive";
  stockPhysical: number;
  stockReserved: number;
  available: number;
}

/**
 * Inventario de todo el catálogo, una fila por variante (RF-34, RN-03): lo que
 * lista la pantalla Inventario del panel sin pedir producto por producto.
 * Orden estable por nombre de producto y orden de la variante. `q` busca en el
 * nombre del producto o el SKU, sin distinguir mayúsculas.
 */
export async function listInventory(
  prisma: Pick<PrismaClient, "productVariant">,
  query: Pagination & { q?: string | undefined },
): Promise<{ items: InventoryRowDto[]; meta: PageMeta }> {
  const where = query.q
    ? {
        OR: [
          { sku: { contains: query.q, mode: "insensitive" as const } },
          { product: { name: { contains: query.q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const [total, rows] = await Promise.all([
    prisma.productVariant.count({ where }),
    prisma.productVariant.findMany({
      where,
      include: { product: { select: { id: true, name: true, slug: true, status: true } } },
      orderBy: [
        { product: { name: "asc" } },
        { productId: "asc" },
        { sortOrder: "asc" },
        { id: "asc" },
      ],
      ...pageWindow(query),
    }),
  ]);
  return {
    items: rows.map((v) => ({
      variantId: v.id,
      sku: v.sku,
      optionLabel: v.optionLabel,
      variantActive: v.active,
      productId: v.product.id,
      productName: v.product.name,
      productSlug: v.product.slug,
      productStatus: v.product.status,
      stockPhysical: v.stockPhysical,
      stockReserved: v.stockReserved,
      available: available(v),
    })),
    meta: pageMeta(total, query),
  };
}
