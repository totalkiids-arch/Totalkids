import type { Banner, Prisma } from "../../generated/prisma/client.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { changedFields, Issues } from "../admin-catalog/common.js";
import { writeAudit, type Actor } from "../audit.js";
import type { CreateBannerInput, UpdateBannerInput } from "./schemas.js";

/**
 * Banners de la tienda (LN-16, RF-28). Mismas reglas y textos que
 * `apps/web/src/features/content/domain/banner.ts` (UI-13):
 *
 * - Título (hasta 60) y texto de apoyo (hasta 140), con los espacios de más
 *   colapsados; orden entero de 1 a 99 (puede repetirse; desempata el título).
 * - El destino solo puede ser una ruta interna: empieza con "/" pero no con
 *   "//", sin barras invertidas, espacios ni caracteres de control. Así se
 *   descartan http:, javascript:, data: y similares.
 * - Ventana de publicación opcional (`startsAt`/`endsAt`); el término debe ser
 *   posterior al inicio.
 * - No se eliminan: DELETE solo desactiva.
 */

export const TITLE_MAX = 60;
export const TEXT_MAX = 140;
export const HREF_MAX = 200;
export const ORDER_MIN = 1;
export const ORDER_MAX = 99;

export const BANNER_MESSAGES = {
  notFound: "Ese banner ya no existe.",
  external:
    "El destino debe ser una página de la tienda que empiece con «/» (p. ej. /catalogo). No se permiten enlaces externos.",
  window: "El término de la publicación debe ser posterior al inicio.",
} as const;

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

export function isInternalHref(href: string): boolean {
  if (href.length === 0 || href.length > HREF_MAX) return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  if (href.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\s\u0000-\u001f\u007f]/.test(href);
}

/** Qué ve hoy la tienda: activo y dentro de su ventana, programado, terminado o inactivo. */
export type BannerVisibility = "visible" | "scheduled" | "ended" | "inactive";

export const BANNER_VISIBILITY_LABEL: Record<BannerVisibility, string> = {
  visible: "Visible",
  scheduled: "Programado",
  ended: "Terminado",
  inactive: "Inactivo",
};

export function bannerVisibility(
  banner: Pick<Banner, "active" | "startsAt" | "endsAt">,
  now: Date,
): BannerVisibility {
  if (!banner.active) return "inactive";
  if (banner.startsAt && banner.startsAt > now) return "scheduled";
  if (banner.endsAt && banner.endsAt <= now) return "ended";
  return "visible";
}

export interface AdminBannerDto {
  id: string;
  title: string;
  text: string;
  href: string;
  sortOrder: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  visibility: BannerVisibility;
  visibilityLabel: string;
  createdAt: string;
  updatedAt: string;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toDto(b: Banner, now: Date): AdminBannerDto {
  const visibility = bannerVisibility(b, now);
  return {
    id: b.id,
    title: b.title,
    text: b.text,
    href: b.href,
    sortOrder: b.sortOrder,
    active: b.active,
    startsAt: iso(b.startsAt),
    endsAt: iso(b.endsAt),
    visibility,
    visibilityLabel: BANNER_VISIBILITY_LABEL[visibility],
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

const byOrder = (a: Banner, b: Banner) =>
  a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "es");

/** Todos, por orden de aparición y luego por título. */
export async function listAdminBanners(
  db: Pick<PrismaClient, "banner">,
  now = new Date(),
): Promise<{ items: AdminBannerDto[] }> {
  const banners = await db.banner.findMany();
  return { items: banners.sort(byOrder).map((b) => toDto(b, now)) };
}

export interface PublicBannerDto {
  id: string;
  title: string;
  text: string;
  href: string;
  sortOrder: number;
}

/** Para la portada (RF-28): solo activos y vigentes ahora, en su orden. */
export async function listPublicBanners(
  db: Pick<PrismaClient, "banner">,
  now = new Date(),
): Promise<{ items: PublicBannerDto[] }> {
  const banners = await db.banner.findMany({
    where: {
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
  });
  return {
    items: banners
      .filter((b) => isInternalHref(b.href))
      .sort(byOrder)
      .map((b) => ({
        id: b.id,
        title: b.title,
        text: b.text,
        href: b.href,
        sortOrder: b.sortOrder,
      })),
  };
}

interface BannerDraft {
  title: string;
  text: string;
  href: string;
  sortOrder: number;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

function checkDraft(d: BannerDraft, issues: Issues): void {
  if (d.title === "") issues.add("title", "Escribe el título del banner.");
  else if (d.title.length > TITLE_MAX) {
    issues.add("title", `Usa ${String(TITLE_MAX)} caracteres o menos.`);
  }
  if (d.text === "") issues.add("text", "Escribe el texto de apoyo.");
  else if (d.text.length > TEXT_MAX)
    issues.add("text", `Usa ${String(TEXT_MAX)} caracteres o menos.`);
  if (d.href === "") issues.add("href", "Escribe el destino, por ejemplo /catalogo.");
  else if (!isInternalHref(d.href)) issues.add("href", BANNER_MESSAGES.external);
  if (d.sortOrder < ORDER_MIN || d.sortOrder > ORDER_MAX) {
    issues.add(
      "sortOrder",
      `El orden debe ser un número entero entre ${String(ORDER_MIN)} y ${String(ORDER_MAX)}.`,
    );
  }
  if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt)
    issues.add("endsAt", BANNER_MESSAGES.window);
}

const toDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);

function auditOf(d: BannerDraft) {
  return {
    title: d.title,
    text: d.text,
    href: d.href,
    sortOrder: d.sortOrder,
    active: d.active,
    startsAt: iso(d.startsAt),
    endsAt: iso(d.endsAt),
  };
}

export async function createBanner(
  prisma: Pick<PrismaClient, "$transaction">,
  input: CreateBannerInput,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<AdminBannerDto> {
  const draft: BannerDraft = {
    title: squash(input.title),
    text: squash(input.text),
    href: input.href.trim(),
    sortOrder: input.sortOrder,
    active: input.active ?? true,
    startsAt: toDate(input.startsAt) ?? null,
    endsAt: toDate(input.endsAt) ?? null,
  };
  const issues = new Issues();
  checkDraft(draft, issues);
  issues.throwIfAny();
  return prisma.$transaction(async (tx) => {
    const banner = await tx.banner.create({ data: draft });
    await writeAudit(
      tx,
      actor,
      {
        action: "banner.created",
        resourceType: "banner",
        resourceId: banner.id,
        details: auditOf(draft),
      },
      requestId,
    );
    return toDto(banner, now);
  });
}

async function lockBanner(tx: Prisma.TransactionClient, id: string): Promise<Banner> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "banners" WHERE "id" = ${id}::uuid FOR UPDATE`;
  const banner = rows.length ? await tx.banner.findUnique({ where: { id } }) : null;
  if (!banner) throw errors.notFound(BANNER_MESSAGES.notFound);
  return banner;
}

export function updateBanner(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  input: UpdateBannerInput,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<AdminBannerDto> {
  return prisma.$transaction(async (tx) => {
    const existing = await lockBanner(tx, id);
    const before: BannerDraft = {
      title: existing.title,
      text: existing.text,
      href: existing.href,
      sortOrder: existing.sortOrder,
      active: existing.active,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
    };
    const startsAt = toDate(input.startsAt);
    const endsAt = toDate(input.endsAt);
    const next: BannerDraft = {
      title: input.title === undefined ? before.title : squash(input.title),
      text: input.text === undefined ? before.text : squash(input.text),
      href: input.href === undefined ? before.href : input.href.trim(),
      sortOrder: input.sortOrder ?? before.sortOrder,
      active: input.active ?? before.active,
      startsAt: startsAt === undefined ? before.startsAt : startsAt,
      endsAt: endsAt === undefined ? before.endsAt : endsAt,
    };
    const issues = new Issues();
    checkDraft(next, issues);
    issues.throwIfAny();

    const changes = changedFields(auditOf(before), auditOf(next), [
      "title",
      "text",
      "href",
      "sortOrder",
      "active",
      "startsAt",
      "endsAt",
    ]);
    if (Object.keys(changes).length === 0) return toDto(existing, now);
    const banner = await tx.banner.update({ where: { id }, data: next });
    const onlyActive = Object.keys(changes).length === 1 && "active" in changes;
    await writeAudit(
      tx,
      actor,
      {
        action: onlyActive
          ? next.active
            ? "banner.activated"
            : "banner.deactivated"
          : "banner.updated",
        resourceType: "banner",
        resourceId: id,
        details: { title: next.title, changes } as Prisma.InputJsonValue,
      },
      requestId,
    );
    return toDto(banner, now);
  });
}

/** DELETE: los banners no se eliminan, se desactivan (idempotente). */
export function deactivateBanner(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<AdminBannerDto> {
  return updateBanner(prisma, id, { active: false }, actor, requestId, now);
}
