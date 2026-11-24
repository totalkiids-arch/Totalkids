import type { Prisma, ShippingZone } from "../../generated/prisma/client.js";
import { isRegionCode, REGION_CODES } from "../../domain/checkout.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { changedFields, Issues, isUniqueViolation } from "../admin-catalog/common.js";
import { writeAudit, type Actor } from "../audit.js";
import { foldCommune } from "../shipping/zone-quoter.js";
import {
  DEFAULT_STORE_THEME,
  STORE_THEMES,
  type CreateZoneInput,
  type ShippingSettingsInput,
  type StoreThemeId,
  type UpdateZoneInput,
} from "./schemas.js";

/**
 * Despacho y retiro del panel (LN-16, RF-08, RF-11, RF-28). Reglas y textos de
 * `apps/web/src/features/shipping/domain/shipping-zone.ts` (UI-13) con los
 * cambios acordados con el cliente: despacho a coordinar (la tarifa puede
 * quedar `null` = por confirmar), elegibilidad para el despacho gratis y retiro
 * en taller que se puede deshabilitar.
 *
 * Cambiar una tarifa, un plazo o desactivar una zona afecta solo compras
 * nuevas: cada pedido guarda su costo, comuna y plazo (RN-02). Las zonas no se
 * borran (los pedidos las citan): se desactivan.
 */

export const COMMUNE_MAX = 80;
export const LEAD_TIME_MAX = 60;
export const PICKUP_MAX = 200;
export const PRICE_MAX = 1_000_000;
export const THRESHOLD_MAX = 100_000_000;
export const RESERVATION_MIN = 1;
export const RESERVATION_MAX = 120;
export const DEFAULT_RESERVATION_MINUTES = 30;

export const ZONE_MESSAGES = {
  notFound: "Esa zona ya no existe.",
  duplicate: "Esa comuna ya tiene una zona en esta región. Edita la existente.",
} as const;

type Tx = Prisma.TransactionClient;

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

export interface AdminZoneDto {
  id: string;
  region: string;
  commune: string;
  /** CLP; 0 = sin costo; null = tarifa por confirmar (despacho a coordinar). */
  price: number | null;
  leadTime: string;
  freeShippingEligible: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function zoneDto(z: ShippingZone): AdminZoneDto {
  return {
    id: z.id,
    region: z.region,
    commune: z.commune,
    price: z.price,
    leadTime: z.leadTime,
    freeShippingEligible: z.freeShippingEligible,
    active: z.active,
    createdAt: z.createdAt.toISOString(),
    updatedAt: z.updatedAt.toISOString(),
  };
}

const regionRank = (code: string) => {
  const i = (REGION_CODES as readonly string[]).indexOf(code);
  return i === -1 ? REGION_CODES.length : i;
};

/** Todas, de norte a sur y luego por comuna. */
export async function listAdminZones(
  db: Pick<PrismaClient, "shippingZone">,
): Promise<{ items: AdminZoneDto[] }> {
  const zones = await db.shippingZone.findMany();
  zones.sort(
    (a, b) =>
      regionRank(a.region) - regionRank(b.region) || a.commune.localeCompare(b.commune, "es"),
  );
  return { items: zones.map(zoneDto) };
}

type ZoneDraft = {
  region: string;
  commune: string;
  price: number | null;
  leadTime: string;
  freeShippingEligible: boolean;
  active: boolean;
};

/**
 * Candado de transacción: dos altas simultáneas de «Ñuñoa» y «Nunoa» no pasan
 * juntas el chequeo de comuna única (el índice único de la base no ve tildes).
 */
async function lockZones(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('totalkids:shipping_zones'))`;
}

async function checkZone(
  tx: Tx,
  d: ZoneDraft,
  exceptId: string | null,
  issues: Issues,
): Promise<void> {
  if (!isRegionCode(d.region)) issues.add("region", "Elige una región.");
  if (d.commune === "") issues.add("commune", "Escribe la comuna.");
  else if (d.commune.length > COMMUNE_MAX) {
    issues.add("commune", `Usa ${String(COMMUNE_MAX)} caracteres o menos.`);
  } else if (isRegionCode(d.region)) {
    const folded = foldCommune(d.commune);
    const others = await tx.shippingZone.findMany({
      where: { region: d.region, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { commune: true },
    });
    if (others.some((z) => foldCommune(z.commune) === folded)) {
      issues.add("commune", ZONE_MESSAGES.duplicate);
    }
  }
  if (d.price !== null) {
    if (d.price < 0)
      issues.add("price", "Escribe la tarifa en pesos, sin decimales (p. ej. 4990).");
    else if (d.price > PRICE_MAX) issues.add("price", "La tarifa parece demasiado alta. Revísala.");
  }
  if (d.leadTime === "") issues.add("leadTime", "Escribe el plazo que verá el comprador.");
  else if (d.leadTime.length > LEAD_TIME_MAX) {
    issues.add("leadTime", `Usa ${String(LEAD_TIME_MAX)} caracteres o menos.`);
  }
}

function duplicateConflict(err: unknown): never {
  if (isUniqueViolation(err)) throw errors.conflict(ZONE_MESSAGES.duplicate, { field: "commune" });
  throw err;
}

export async function createZone(
  prisma: Pick<PrismaClient, "$transaction">,
  input: CreateZoneInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminZoneDto> {
  const draft: ZoneDraft = {
    region: input.region.trim().toUpperCase(),
    commune: squash(input.commune),
    price: input.price,
    leadTime: squash(input.leadTime),
    freeShippingEligible: input.freeShippingEligible ?? true,
    active: input.active ?? true,
  };
  try {
    return await prisma.$transaction(async (tx) => {
      await lockZones(tx);
      const issues = new Issues();
      await checkZone(tx, draft, null, issues);
      issues.throwIfAny();
      const zone = await tx.shippingZone.create({ data: draft });
      await writeAudit(
        tx,
        actor,
        {
          action: "shipping_zone.created",
          resourceType: "shipping_zone",
          resourceId: zone.id,
          details: { ...draft },
        },
        requestId,
      );
      return zoneDto(zone);
    });
  } catch (err) {
    return duplicateConflict(err);
  }
}

export async function updateZone(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  input: UpdateZoneInput,
  actor: Actor,
  requestId?: string,
): Promise<AdminZoneDto> {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockZones(tx);
      const existing = await tx.shippingZone.findUnique({ where: { id } });
      if (!existing) throw errors.notFound(ZONE_MESSAGES.notFound);
      const before: ZoneDraft = {
        region: existing.region,
        commune: existing.commune,
        price: existing.price,
        leadTime: existing.leadTime,
        freeShippingEligible: existing.freeShippingEligible,
        active: existing.active,
      };
      const next: ZoneDraft = {
        region: input.region === undefined ? before.region : input.region.trim().toUpperCase(),
        commune: input.commune === undefined ? before.commune : squash(input.commune),
        price: input.price === undefined ? before.price : input.price,
        leadTime: input.leadTime === undefined ? before.leadTime : squash(input.leadTime),
        freeShippingEligible: input.freeShippingEligible ?? before.freeShippingEligible,
        active: input.active ?? before.active,
      };
      const issues = new Issues();
      await checkZone(tx, next, id, issues);
      issues.throwIfAny();

      const changes = changedFields(before, next, [
        "region",
        "commune",
        "price",
        "leadTime",
        "freeShippingEligible",
        "active",
      ]);
      if (Object.keys(changes).length === 0) return zoneDto(existing);
      // Los pedidos ya hechos guardan su costo, comuna y plazo (RN-02): no se tocan.
      const zone = await tx.shippingZone.update({ where: { id }, data: next });
      const onlyActive = Object.keys(changes).length === 1 && "active" in changes;
      await writeAudit(
        tx,
        actor,
        {
          action: onlyActive
            ? next.active
              ? "shipping_zone.activated"
              : "shipping_zone.deactivated"
            : "shipping_zone.updated",
          resourceType: "shipping_zone",
          resourceId: id,
          details: { region: next.region, commune: next.commune, changes } as Prisma.InputJsonValue,
        },
        requestId,
      );
      return zoneDto(zone);
    });
  } catch (err) {
    return duplicateConflict(err);
  }
}

/** DELETE: desactiva (no se borra; los pedidos la citan). Idempotente. */
export function deactivateZone(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  actor: Actor,
  requestId?: string,
): Promise<AdminZoneDto> {
  return updateZone(prisma, id, { active: false }, actor, requestId);
}

// ── Condiciones de retiro y despacho ─────────────────────────────────────────

export interface ShippingSettingsDto {
  pickupEnabled: boolean;
  /** Dirección y horario de retiro en taller (el retiro es gratis). */
  pickupDetails: string;
  /** Despacho gratis desde este subtotal − descuento, en CLP; null = sin umbral. */
  freeShippingThreshold: number | null;
  /** Minutos que el stock queda reservado mientras se paga (RN-04). */
  reservationMinutes: number;
  updatedAt: string | null;
}

type SettingsReader = Pick<PrismaClient, "setting">;

export async function getShippingSettings(db: SettingsReader): Promise<ShippingSettingsDto> {
  const s = await db.setting.findUnique({ where: { id: 1 } });
  if (!s) {
    return {
      pickupEnabled: false,
      pickupDetails: "",
      freeShippingThreshold: null,
      reservationMinutes: DEFAULT_RESERVATION_MINUTES,
      updatedAt: null,
    };
  }
  return {
    pickupEnabled: s.pickupEnabled,
    pickupDetails: s.pickupDetails,
    freeShippingThreshold: s.freeShippingThreshold,
    reservationMinutes: s.reservationMinutes,
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Bloquea la fila de configuración (y la crea si falta) para que dos guardados no se pisen. */
async function lockSettings(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('totalkids:settings'))`;
}

export async function saveShippingSettings(
  prisma: Pick<PrismaClient, "$transaction">,
  input: ShippingSettingsInput,
  actor: Actor,
  requestId?: string,
): Promise<ShippingSettingsDto> {
  const next = {
    pickupEnabled: input.pickupEnabled,
    pickupDetails: squash(input.pickupDetails),
    freeShippingThreshold: input.freeShippingThreshold,
    reservationMinutes: input.reservationMinutes,
  };
  const issues = new Issues();
  if (next.pickupDetails === "") {
    issues.add("pickupDetails", "Escribe la dirección y el horario de retiro.");
  } else if (next.pickupDetails.length > PICKUP_MAX) {
    issues.add("pickupDetails", `Usa ${String(PICKUP_MAX)} caracteres o menos.`);
  }
  const threshold = next.freeShippingThreshold;
  if (threshold !== null && threshold < 0) {
    issues.add(
      "freeShippingThreshold",
      "Escribe un monto en pesos, o déjalo vacío si no hay despacho gratis.",
    );
  } else if (threshold !== null && threshold > THRESHOLD_MAX) {
    issues.add("freeShippingThreshold", "El monto parece demasiado alto. Revísalo.");
  }
  if (next.reservationMinutes < RESERVATION_MIN || next.reservationMinutes > RESERVATION_MAX) {
    issues.add(
      "reservationMinutes",
      `Escribe un número de minutos entre ${String(RESERVATION_MIN)} y ${String(RESERVATION_MAX)}.`,
    );
  }
  issues.throwIfAny();

  return prisma.$transaction(async (tx) => {
    await lockSettings(tx);
    const before = await getShippingSettings(tx);
    await tx.setting.upsert({
      where: { id: 1 },
      create: { id: 1, ...next },
      update: next,
    });
    const changes = changedFields(before as unknown as Record<string, unknown>, next, [
      "pickupEnabled",
      "pickupDetails",
      "freeShippingThreshold",
      "reservationMinutes",
    ]);
    if (Object.keys(changes).length > 0) {
      await writeAudit(
        tx,
        actor,
        {
          action: "settings.shipping_updated",
          resourceType: "settings",
          resourceId: "1",
          details: { changes } as Prisma.InputJsonValue,
        },
        requestId,
      );
    }
    return getShippingSettings(tx);
  });
}

// ── Plantilla de la tienda (UI-13) ───────────────────────────────────────────

const isTheme = (value: string): value is StoreThemeId =>
  (STORE_THEMES as readonly string[]).includes(value);

export async function getStoreTheme(db: SettingsReader): Promise<{ theme: StoreThemeId }> {
  const s = await db.setting.findUnique({ where: { id: 1 }, select: { activeTheme: true } });
  return { theme: s && isTheme(s.activeTheme) ? s.activeTheme : DEFAULT_STORE_THEME };
}

export async function getAdminStoreTheme(
  db: SettingsReader,
): Promise<{ theme: StoreThemeId; themes: readonly StoreThemeId[]; updatedAt: string | null }> {
  const s = await db.setting.findUnique({ where: { id: 1 } });
  return {
    theme: s && isTheme(s.activeTheme) ? s.activeTheme : DEFAULT_STORE_THEME,
    themes: STORE_THEMES,
    updatedAt: s ? s.updatedAt.toISOString() : null,
  };
}

/** Solo puede haber una activa. Si la fila de configuración falta, se crea con el retiro deshabilitado. */
export async function setStoreTheme(
  prisma: Pick<PrismaClient, "$transaction">,
  theme: StoreThemeId,
  actor: Actor,
  requestId?: string,
): Promise<{ theme: StoreThemeId; themes: readonly StoreThemeId[]; updatedAt: string | null }> {
  return prisma.$transaction(async (tx) => {
    await lockSettings(tx);
    const before = (await getStoreTheme(tx)).theme;
    await tx.setting.upsert({
      where: { id: 1 },
      create: { id: 1, pickupDetails: "", pickupEnabled: false, activeTheme: theme },
      update: { activeTheme: theme },
    });
    if (before !== theme) {
      await writeAudit(
        tx,
        actor,
        {
          action: "settings.theme_changed",
          resourceType: "settings",
          resourceId: "1",
          details: { changes: { activeTheme: { before, after: theme } } },
        },
        requestId,
      );
    }
    return getAdminStoreTheme(tx);
  });
}
