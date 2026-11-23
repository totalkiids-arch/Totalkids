import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../lib/prisma.js";
import { hashToken, randomToken } from "../lib/secrets.js";
import { normalizeEmail } from "./auth.js";
import { enqueueEmail } from "./email/enqueue.js";
import { emailEventKey } from "./email/events.js";

/**
 * Newsletter (LN-08, RF-25, RF-35).
 *
 * - Suscribirse exige consentimiento explícito; se guarda la fecha y la versión
 *   del texto aceptado. Volver a suscribirse reactiva y renueva el consentimiento.
 * - La baja va con credencial: se pide con el correo y llega un enlace con un
 *   token aleatorio (el worker lo emite al enviar, así nunca queda en claro en
 *   la base ni en el outbox). El enlace confirma la baja.
 * - Ninguna respuesta revela si un correo está en la lista.
 * - La baja no borra nada: los pedidos y el historial del suscriptor siguen.
 */

type Db = Pick<PrismaClient, "$transaction" | "newsletterSubscriber" | "outboxJob" | "emailLog">;

/** Quién registra una baja pedida por el propio suscriptor (lo ve el panel). */
export const SUBSCRIBER_ACTOR = "Suscriptor";

/** Hash de un token nuevo que nadie conoce: invalida los enlaces anteriores. */
const freshTokenHash = () => hashToken(randomToken());

export interface SubscribeInput {
  email: string;
  consentVersion: string;
}

/** Alta o reactivación con el consentimiento de hoy. No informa si ya existía. */
export async function subscribe(db: Db, input: SubscribeInput, now = new Date()): Promise<void> {
  const email = normalizeEmail(input.email);
  const consent = { consentedAt: now, consentVersion: input.consentVersion };
  const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
  if (!existing) {
    try {
      await db.newsletterSubscriber.create({
        data: { email, ...consent, unsubscribeTokenHash: freshTokenHash() },
      });
      return;
    } catch (error) {
      // Dos altas simultáneas del mismo correo: la otra ganó; se actualiza abajo.
      if ((error as { code?: unknown }).code !== "P2002") throw error;
    }
  }
  await db.newsletterSubscriber.update({
    where: { email },
    data:
      existing?.status === "active"
        ? consent
        : {
            ...consent,
            status: "active",
            unsubscribedAt: null,
            unsubscribedBy: null,
            // Los enlaces de baja de la suscripción anterior dejan de servir.
            unsubscribeTokenHash: freshTokenHash(),
          },
  });
}

/**
 * Pide el enlace de baja. Si el correo tiene una suscripción activa, encola el
 * correo `newsletter_unsubscribe`; si no, no hace nada. Responde igual siempre.
 */
export async function requestUnsubscribeLink(db: Db, rawEmail: string): Promise<void> {
  const subscriber = await db.newsletterSubscriber.findUnique({
    where: { email: normalizeEmail(rawEmail) },
  });
  if (subscriber?.status !== "active") return;
  await db.$transaction((tx) =>
    enqueueEmail(tx, {
      event: "newsletter_unsubscribe",
      recipient: subscriber.email,
      eventKey: emailEventKey("newsletter_unsubscribe", subscriber.id, randomUUID()),
      data: { subscriberId: subscriber.id },
    }),
  );
}

/**
 * Emite el token de baja para el correo (lo llama el worker al enviarlo). Solo
 * vale el último enlace enviado. Devuelve el token en claro una sola vez, o null
 * si la suscripción ya no está activa.
 */
export async function issueUnsubscribeToken(
  db: Pick<PrismaClient, "newsletterSubscriber">,
  subscriberId: string,
): Promise<string | null> {
  const token = randomToken();
  const { count } = await db.newsletterSubscriber.updateMany({
    where: { id: subscriberId, status: "active" },
    data: { unsubscribeTokenHash: hashToken(token) },
  });
  return count > 0 ? token : null;
}

/**
 * Confirma la baja con el token del enlace. Devuelve false si el token no
 * corresponde a ninguna suscripción. Repetir el enlace después de la baja sigue
 * respondiendo true (el token no cambia hasta que vuelva a suscribirse).
 */
export async function unsubscribeWithToken(
  db: Pick<PrismaClient, "newsletterSubscriber">,
  token: string,
  now = new Date(),
): Promise<boolean> {
  const tokenHash = hashToken(token);
  const subscriber = await db.newsletterSubscriber.findUnique({
    where: { unsubscribeTokenHash: tokenHash },
    select: { id: true },
  });
  if (!subscriber) return false;
  await db.newsletterSubscriber.updateMany({
    where: { id: subscriber.id, status: "active" },
    data: { status: "unsubscribed", unsubscribedAt: now, unsubscribedBy: SUBSCRIBER_ACTOR },
  });
  return true;
}
