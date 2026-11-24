import type { NewsletterSubscriber, Prisma } from "../../generated/prisma/client.js";
import type { SubscriberStatus } from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import { pageMeta, pageWindow, type PageMeta } from "../../lib/pagination.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { writeAudit, type Actor } from "../audit.js";
import type { SubscriberFilters, SubscriberListQuery } from "./schemas.js";

/**
 * Suscriptores del newsletter en el panel (LN-16, RF-25, RF-29, RF-35). Solo
 * Administrador. Reglas de `apps/web/src/features/newsletter/domain/subscriber.ts`
 * (UI-14): la baja no borra el registro; deja la fecha y quién la registró (el
 * propio suscriptor o el rol del equipo). Una baja repetida no cambia la fecha.
 */

export const SUBSCRIBER_STATUS_LABEL: Record<SubscriberStatus, string> = {
  active: "Activo",
  unsubscribed: "Dado de baja",
};

export const SUBSCRIBER_MESSAGES = {
  notFound: "Ese suscriptor ya no existe.",
  already: "Ese suscriptor ya estaba dado de baja.",
} as const;

export interface AdminSubscriberDto {
  id: string;
  email: string;
  status: SubscriberStatus;
  statusLabel: string;
  consentedAt: string;
  consentVersion: string;
  unsubscribedAt: string | null;
  /** «Suscriptor» o el rol que la registró. */
  unsubscribedBy: string | null;
}

export function subscriberDto(s: NewsletterSubscriber): AdminSubscriberDto {
  return {
    id: s.id,
    email: s.email,
    status: s.status,
    statusLabel: SUBSCRIBER_STATUS_LABEL[s.status],
    consentedAt: s.consentedAt.toISOString(),
    consentVersion: s.consentVersion,
    unsubscribedAt: s.unsubscribedAt ? s.unsubscribedAt.toISOString() : null,
    unsubscribedBy: s.unsubscribedBy,
  };
}

export function subscriberWhere(filters: SubscriberFilters): Prisma.NewsletterSubscriberWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { email: { contains: filters.q.toLowerCase() } } : {}),
  };
}

/** Del consentimiento más reciente al más antiguo, con el conteo por estado. */
export async function listAdminSubscribers(
  db: Pick<PrismaClient, "newsletterSubscriber">,
  query: SubscriberListQuery,
): Promise<{
  items: AdminSubscriberDto[];
  meta: PageMeta;
  counts: Record<SubscriberStatus, number>;
}> {
  const where = subscriberWhere(query);
  const [total, rows, grouped] = await Promise.all([
    db.newsletterSubscriber.count({ where }),
    db.newsletterSubscriber.findMany({
      where,
      orderBy: [{ consentedAt: "desc" }, { id: "desc" }],
      ...pageWindow(query),
    }),
    db.newsletterSubscriber.groupBy({
      by: ["status"],
      where: subscriberWhere({ q: query.q }),
      _count: { _all: true },
    }),
  ]);
  const counts: Record<SubscriberStatus, number> = { active: 0, unsubscribed: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  return { items: rows.map(subscriberDto), meta: pageMeta(total, query), counts };
}

/** Baja registrada desde el panel: conserva el registro; 409 si ya estaba de baja. */
export function unsubscribeFromPanel(
  prisma: Pick<PrismaClient, "$transaction">,
  id: string,
  actor: Actor,
  requestId?: string,
  now = new Date(),
): Promise<AdminSubscriberDto> {
  return prisma.$transaction(async (tx) => {
    // Condicional: una baja simultánea por el enlace del correo no se pisa.
    const changed = await tx.newsletterSubscriber.updateMany({
      where: { id, status: "active" },
      data: { status: "unsubscribed", unsubscribedAt: now, unsubscribedBy: actor.actorLabel },
    });
    const subscriber = await tx.newsletterSubscriber.findUnique({ where: { id } });
    if (!subscriber) throw errors.notFound(SUBSCRIBER_MESSAGES.notFound);
    if (changed.count === 0) throw errors.conflict(SUBSCRIBER_MESSAGES.already, { field: "form" });
    await writeAudit(
      tx,
      actor,
      {
        action: "newsletter.unsubscribed",
        resourceType: "newsletter_subscriber",
        resourceId: id,
        // Sin el correo: el registro ya lo identifica.
        details: { consentVersion: subscriber.consentVersion },
      },
      requestId,
    );
    return subscriberDto(subscriber);
  });
}
