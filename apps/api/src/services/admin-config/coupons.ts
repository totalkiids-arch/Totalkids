import type { Coupon, Prisma } from "../../generated/prisma/client.js";
import type { CouponKind } from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { changedFields, Issues, isUniqueViolation } from "../admin-catalog/common.js";
import { writeAudit, type Actor } from "../audit.js";
import { chileDate, dateOnly } from "../cart/chile-date.js";
import { normalizeCouponCode } from "../coupons.js";
import type { CreateCouponInput, UpdateCouponInput } from "./schemas.js";

/**
 * Cupones del panel (LN-16, RF-07, RF-28, RN-01, RN-02). Mismas reglas y textos
 * que `apps/web/src/features/coupons/domain/coupon.ts` (UI-13):
 *
 * - Código normalizado (mayúsculas, sin espacios), de 3 a 20 caracteres
 *   (A–Z, 0–9, - y _), único sin distinguir mayúsculas.
 * - Porcentaje entero 1–100 o monto entero > 0; inicio ≤ término (días de Chile);
 *   máximo de usos ≥ usos registrados.
 * - Con usos (`uses_count` > 0: reservados + consumidos), código, tipo y valor
 *   quedan fijos (409): para otro descuento se crea un cupón nuevo.
 * - Solo se elimina un cupón sin usos, sin canjes (ni liberados) y sin pedidos
 *   que lo citen; si no, se desactiva (409).
 *
 * Editar o desactivar afecta solo compras nuevas: cada pedido guarda su código
 * y su descuento (RN-02).
 */

export const CODE_MIN = 3;
export const CODE_MAX = 20;
export const PERCENT_MAX = 100;
export const AMOUNT_MAX = 10_000_000;
export const MAX_USES_LIMIT = 1_000_000;

export const COUPON_MESSAGES = {
  lockedByUses: "Tiene usos: para otro descuento crea un cupón nuevo.",
  inUseCannotDelete: "Este cupón tiene usos: solo se puede desactivar.",
  notFound: "Ese cupón ya no existe.",
  duplicate: "Ese código ya existe. Usa otro o edita el cupón existente.",
} as const;

export type CouponStatus = "active" | "scheduled" | "expired" | "exhausted" | "inactive";

export const COUPON_STATUS_LABEL: Record<CouponStatus, string> = {
  active: "Activo",
  scheduled: "Programado",
  exhausted: "Agotado",
  expired: "Vencido",
  inactive: "Inactivo",
};

/** Prioridad del panel: inactivo > agotado > vencido > programado > activo. */
export function couponStatus(
  coupon: { active: boolean; usesCount: number; maxUses: number; startsOn: string; endsOn: string },
  today: string,
): CouponStatus {
  if (!coupon.active) return "inactive";
  if (coupon.usesCount >= coupon.maxUses) return "exhausted";
  if (today > coupon.endsOn) return "expired";
  if (today < coupon.startsOn) return "scheduled";
  return "active";
}

const STATUS_RANK: Record<CouponStatus, number> = {
  active: 0,
  scheduled: 1,
  exhausted: 2,
  expired: 3,
  inactive: 4,
};

export interface AdminCouponDto {
  id: string;
  code: string;
  kind: CouponKind;
  value: number;
  /** AAAA-MM-DD, días de Chile, ambos inclusive. */
  startsOn: string;
  endsOn: string;
  maxUses: number;
  /** Usos registrados (reservados + consumidos): cuentan para el cupo. */
  uses: number;
  /** Pedidos pendientes de pago que tienen el uso reservado. */
  reservedUses: number;
  /** Pedidos pagados que consumieron el uso. */
  consumedUses: number;
  active: boolean;
  status: CouponStatus;
  statusLabel: string;
  /** Código, tipo y valor fijos (tiene usos). */
  termsLocked: boolean;
  /** Se puede eliminar (sin usos, canjes ni pedidos); si no, solo desactivar. */
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CouponUsage {
  reserved: number;
  consumed: number;
  /** Canjes en cualquier estado + pedidos que lo citan. */
  references: number;
}

type Tx = Prisma.TransactionClient;
type Reader = Pick<Tx, "couponRedemption" | "order">;

async function usageOf(db: Reader, couponIds: string[]): Promise<Map<string, CouponUsage>> {
  const usage = new Map<string, CouponUsage>(
    couponIds.map((id) => [id, { reserved: 0, consumed: 0, references: 0 }]),
  );
  if (couponIds.length === 0) return usage;
  const [redemptions, orders] = await Promise.all([
    db.couponRedemption.groupBy({
      by: ["couponId", "status"],
      where: { couponId: { in: couponIds } },
      _count: { _all: true },
    }),
    db.order.groupBy({
      by: ["couponId"],
      where: { couponId: { in: couponIds } },
      _count: { _all: true },
    }),
  ]);
  for (const r of redemptions) {
    const u = usage.get(r.couponId);
    if (!u) continue;
    if (r.status === "reserved") u.reserved += r._count._all;
    if (r.status === "consumed") u.consumed += r._count._all;
    u.references += r._count._all;
  }
  for (const o of orders) {
    const u = o.couponId ? usage.get(o.couponId) : undefined;
    if (u) u.references += o._count._all;
  }
  return usage;
}

function toDto(coupon: Coupon, usage: CouponUsage, today: string): AdminCouponDto {
  const startsOn = dateOnly(coupon.startsOn);
  const endsOn = dateOnly(coupon.endsOn);
  const status = couponStatus(
    {
      active: coupon.active,
      usesCount: coupon.usesCount,
      maxUses: coupon.maxUses,
      startsOn,
      endsOn,
    },
    today,
  );
  return {
    id: coupon.id,
    code: coupon.code,
    kind: coupon.kind,
    value: coupon.value,
    startsOn,
    endsOn,
    maxUses: coupon.maxUses,
    uses: coupon.usesCount,
    reservedUses: usage.reserved,
    consumedUses: usage.consumed,
    active: coupon.active,
    status,
    statusLabel: COUPON_STATUS_LABEL[status],
    termsLocked: coupon.usesCount > 0,
    canDelete: coupon.usesCount === 0 && usage.references === 0,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

/** Todos los cupones: activos primero (orden del panel) y luego por código. */
export async function listAdminCoupons(
  db: Pick<PrismaClient, "coupon" | "couponRedemption" | "order">,
  now = new Date(),
): Promise<{ today: string; items: AdminCouponDto[] }> {
  const today = chileDate(now);
  const coupons = await db.coupon.findMany({ orderBy: { code: "asc" } });
  const usage = await usageOf(
    db,
    coupons.map((c) => c.id),
  );
  const items = coupons
    .map((c) => toDto(c, usage.get(c.id) ?? { reserved: 0, consumed: 0, references: 0 }, today))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.code.localeCompare(b.code));
  return { today, items };
}

async function dtoById(tx: Tx, id: string, now: Date): Promise<AdminCouponDto> {
  const coupon = await tx.coupon.findUnique({ where: { id } });
  if (!coupon) throw errors.notFound(COUPON_MESSAGES.notFound);
  const usage = await usageOf(tx, [id]);
  return toDto(
    coupon,
    usage.get(id) ?? { reserved: 0, consumed: 0, references: 0 },
    chileDate(now),
  );
}

export async function getAdminCoupon(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  now = new Date(),
): Promise<AdminCouponDto> {
  return prisma.$transaction((tx) => dtoById(tx, id, now));
}

/** Bloquea la fila (FOR UPDATE): una compra simultánea que reserve un uso espera. */
async function lockCoupon(tx: Tx, id: string): Promise<Coupon> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "coupons" WHERE "id" = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw errors.notFound(COUPON_MESSAGES.notFound);
  const coupon = await tx.coupon.findUnique({ where: { id } });
  if (!coupon) throw errors.notFound(COUPON_MESSAGES.notFound);
  return coupon;
}

type CouponTerms = {
  code: string;
  kind: CouponKind;
  value: number;
  startsOn: string;
  endsOn: string;
  maxUses: number;
  active: boolean;
};

/** Reglas de forma con los textos del panel (422 con un issue por campo). */
function checkTerms(terms: CouponTerms, usesSoFar: number, issues: Issues): void {
  const { code, kind, value, maxUses } = terms;
  if (code === "") issues.add("code", "Escribe el código del cupón.");
  else if (code.length < CODE_MIN || code.length > CODE_MAX) {
    issues.add(
      "code",
      `El código debe tener entre ${String(CODE_MIN)} y ${String(CODE_MAX)} caracteres.`,
    );
  } else if (!/^[A-Z0-9_-]+$/.test(code)) {
    issues.add("code", "Usa solo letras sin tilde (A–Z), números, guion (-) o guion bajo (_).");
  }

  if (kind === "percent") {
    if (value < 1 || value > PERCENT_MAX) {
      issues.add("value", "El porcentaje debe ser un número entero entre 1 y 100.");
    }
  } else if (value <= 0) issues.add("value", "El monto debe ser mayor que 0.");
  else if (value > AMOUNT_MAX) issues.add("value", "El monto parece demasiado alto. Revísalo.");

  if (terms.endsOn < terms.startsOn) {
    issues.add("endsOn", "La fecha de término no puede ser anterior al inicio.");
  }

  if (maxUses < 1) {
    issues.add("maxUses", "El máximo de usos debe ser un número entero de al menos 1.");
  } else if (maxUses > MAX_USES_LIMIT) {
    issues.add("maxUses", "El máximo de usos parece demasiado alto. Revísalo.");
  } else if (maxUses < usesSoFar) {
    issues.add(
      "maxUses",
      `El máximo no puede ser menor que los ${String(usesSoFar)} usos ya consumidos.`,
    );
  }
}

async function checkUniqueCode(
  tx: Tx,
  code: string,
  exceptId: string | null,
  issues: Issues,
): Promise<void> {
  if (issues.list.some((i) => i.path === "code")) return;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "coupons" WHERE upper("code") = ${code}
      AND (${exceptId}::uuid IS NULL OR "id" <> ${exceptId}::uuid) LIMIT 1`;
  if (rows.length > 0) issues.add("code", COUPON_MESSAGES.duplicate);
}

const asDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

function auditTerms(terms: CouponTerms) {
  return { ...terms };
}

export async function createCoupon(
  prisma: Pick<PrismaClient, "$transaction">,
  input: CreateCouponInput,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<AdminCouponDto> {
  const terms: CouponTerms = {
    code: normalizeCouponCode(input.code),
    kind: input.kind,
    value: input.value,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    maxUses: input.maxUses,
    active: input.active ?? true,
  };
  try {
    return await prisma.$transaction(async (tx) => {
      const issues = new Issues();
      checkTerms(terms, 0, issues);
      await checkUniqueCode(tx, terms.code, null, issues);
      issues.throwIfAny();
      const coupon = await tx.coupon.create({
        data: {
          code: terms.code,
          kind: terms.kind,
          value: terms.value,
          startsOn: asDate(terms.startsOn),
          endsOn: asDate(terms.endsOn),
          maxUses: terms.maxUses,
          active: terms.active,
        },
      });
      await writeAudit(
        tx,
        actor,
        {
          action: "coupon.created",
          resourceType: "coupon",
          resourceId: coupon.id,
          details: auditTerms(terms),
        },
        requestId,
      );
      return dtoById(tx, coupon.id, now);
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw errors.conflict(COUPON_MESSAGES.duplicate, { field: "code" });
    }
    throw err;
  }
}

export async function updateCoupon(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  input: UpdateCouponInput,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<AdminCouponDto> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await lockCoupon(tx, id);
      const before: CouponTerms = {
        code: existing.code,
        kind: existing.kind,
        value: existing.value,
        startsOn: dateOnly(existing.startsOn),
        endsOn: dateOnly(existing.endsOn),
        maxUses: existing.maxUses,
        active: existing.active,
      };
      const next: CouponTerms = {
        code: input.code === undefined ? before.code : normalizeCouponCode(input.code),
        kind: input.kind ?? before.kind,
        value: input.value ?? before.value,
        startsOn: input.startsOn ?? before.startsOn,
        endsOn: input.endsOn ?? before.endsOn,
        maxUses: input.maxUses ?? before.maxUses,
        active: input.active ?? before.active,
      };

      // Con usos, código, tipo y valor quedan fijos (trazabilidad de canjes y reportes).
      if (existing.usesCount > 0) {
        const locked = (["code", "kind", "value"] as const).filter((k) => next[k] !== before[k]);
        if (locked.length > 0) {
          throw errors.conflict(COUPON_MESSAGES.lockedByUses, {
            field: locked[0],
            fields: locked,
          });
        }
      }

      const issues = new Issues();
      checkTerms(next, existing.usesCount, issues);
      if (next.code !== before.code) await checkUniqueCode(tx, next.code, id, issues);
      issues.throwIfAny();

      const changes = changedFields(before, next, [
        "code",
        "kind",
        "value",
        "startsOn",
        "endsOn",
        "maxUses",
        "active",
      ]);
      if (Object.keys(changes).length > 0) {
        await tx.coupon.update({
          where: { id },
          data: {
            code: next.code,
            kind: next.kind,
            value: next.value,
            startsOn: asDate(next.startsOn),
            endsOn: asDate(next.endsOn),
            maxUses: next.maxUses,
            active: next.active,
          },
        });
        const onlyActive = Object.keys(changes).length === 1 && "active" in changes;
        await writeAudit(
          tx,
          actor,
          {
            action: onlyActive
              ? next.active
                ? "coupon.activated"
                : "coupon.deactivated"
              : "coupon.updated",
            resourceType: "coupon",
            resourceId: id,
            details: { code: next.code, changes } as Prisma.InputJsonValue,
          },
          requestId,
        );
      }
      return dtoById(tx, id, now);
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw errors.conflict(COUPON_MESSAGES.duplicate, { field: "code" });
    }
    throw err;
  }
}

/** Elimina un cupón sin usos ni historial; con usos, 409 (solo se desactiva). */
export async function deleteCoupon(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  actor: Actor,
  requestId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const coupon = await lockCoupon(tx, id);
    const usage = (await usageOf(tx, [id])).get(id);
    if (coupon.usesCount > 0 || (usage?.references ?? 0) > 0) {
      throw errors.conflict(COUPON_MESSAGES.inUseCannotDelete, { field: "form" });
    }
    // Un carrito que lo tenga aplicado queda sin cupón (ON DELETE SET NULL).
    await tx.coupon.delete({ where: { id } });
    await writeAudit(
      tx,
      actor,
      {
        action: "coupon.deleted",
        resourceType: "coupon",
        resourceId: id,
        details: {
          code: coupon.code,
          kind: coupon.kind,
          value: coupon.value,
          startsOn: dateOnly(coupon.startsOn),
          endsOn: dateOnly(coupon.endsOn),
          maxUses: coupon.maxUses,
        },
      },
      requestId,
    );
  });
}
