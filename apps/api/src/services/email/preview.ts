import { randomUUID } from "node:crypto";

import type { EmailEvent } from "../../generated/prisma/enums.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { EMAIL_EVENTS, PREVIEW_KEY_PREFIX, parseEmailData, type EmailDataInput } from "./events.js";
import type { SendResult } from "./sender.js";
import {
  newsletterUnsubscribeUrl,
  passwordResetUrl,
  renderEmail,
  type RenderContext,
  type RenderedEmail,
} from "./templates/index.js";

/**
 * Correos de muestra (`pnpm --filter @totalkids/api email:preview`): un ejemplo
 * de cada plantilla con datos ficticios (pedido TK-9999, solicitud SOL-9999). No
 * crean pedidos ni tokens: los enlaces de recuperación y baja llevan un token
 * falso que no sirve.
 */

export const PREVIEW_SUBJECT_PREFIX = "[Muestra] ";

const PREVIEW_TOKEN = "token-de-muestra";
const PICKUP =
  "Taller Total Kids (muestra): Av. Ejemplo 123, Temuco. Lunes a viernes de 10 a 18 h.";

const LINES = [
  {
    name: "Cama casita Montessori",
    variant: "Roble natural, 90 cm",
    quantity: 1,
    unitPrice: 189990,
    lineTotal: 189990,
    extras: ["Armado en domicilio"],
    madeToOrder: true,
    leadTime: "10 días hábiles",
  },
  {
    name: "Silla infantil",
    variant: "Azul",
    quantity: 2,
    unitPrice: 24990,
    lineTotal: 49980,
    extras: [],
    madeToOrder: false,
  },
];
const AMOUNTS = { subtotal: 239970, discount: 10000, shippingCost: 12990, total: 242960 };

export interface PreviewSample<E extends EmailEvent = EmailEvent> {
  /** Nombre del archivo y de la clave: "01-order_received". */
  slug: string;
  event: E;
  data: EmailDataInput<E>;
}

function sample<E extends EmailEvent>(slug: string, event: E, data: EmailDataInput<E>) {
  return { slug, event, data } as PreviewSample;
}

/** Un ejemplo por evento, más las variantes de retiro en taller y solicitud al equipo. */
export function previewSamples(now: Date): PreviewSample[] {
  const dueAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  const samples: PreviewSample[] = [
    sample("01-order_received", "order_received", {
      orderNumber: 9999,
      buyerName: "Ana Muestra",
      items: LINES,
      ...AMOUNTS,
      paymentDueAt: dueAt,
      delivery: {
        method: "shipping",
        address: "Av. Siempre Viva 742, depto 4, Temuco",
        leadTime: "5 a 7 días hábiles",
      },
    }),
    sample("02-purchase_confirmed", "purchase_confirmed", {
      orderNumber: 9999,
      buyerName: "Ana Muestra",
      items: LINES,
      ...AMOUNTS,
      delivery: {
        method: "shipping",
        address: "Av. Siempre Viva 742, depto 4, Temuco",
        leadTime: "5 a 7 días hábiles",
      },
      taxDocument: "boleta",
      contact: "+56 9 0000 0000 (muestra)",
    }),
    sample("03-new_sale", "new_sale", {
      orderNumber: 9999,
      total: AMOUNTS.total,
      itemCount: 3,
      deliveryMethod: "shipping",
      taxDocument: "factura",
    }),
    sample("04-payment_rejected", "payment_rejected", {
      orderNumber: 9999,
      buyerName: "Ana Muestra",
      outcome: "rejected",
    }),
    sample("05-order_shipped", "order_shipped", {
      method: "shipping",
      orderNumber: 9999,
      buyerName: "Ana Muestra",
      carrier: "Starken",
      trackingCode: "ST-0000000",
    }),
    sample("05b-order_shipped-retiro", "order_shipped", {
      method: "pickup",
      orderNumber: 9999,
      buyerName: "Ana Muestra",
      pickupDetails: PICKUP,
    }),
    sample("06-order_delivered", "order_delivered", {
      orderNumber: 9999,
      buyerName: "Ana Muestra",
    }),
    sample("07-service_request", "service_request", {
      audience: "requester",
      requestNumber: 9999,
      service: "Diseño a medida",
      name: "Ana Muestra",
      responseTime: "2 días hábiles",
    }),
    sample("07b-service_request-equipo", "service_request", {
      audience: "admin",
      requestNumber: 9999,
      service: "Diseño a medida",
      name: "Ana Muestra",
      responseTime: "2 días hábiles",
    }),
    sample("08-password_recovery", "password_recovery", {
      userId: "00000000-0000-4000-8000-000000000000",
    }),
    sample("09-newsletter_unsubscribe", "newsletter_unsubscribe", {
      subscriberId: "00000000-0000-4000-8000-000000000000",
    }),
    sample("10-payment_review_alert", "payment_review_alert", {
      orderNumber: 9999,
      reason: "late_no_stock",
      attempt: 2,
      amount: AMOUNTS.total,
    }),
    sample("11-email_quota_alert", "email_quota_alert", {
      day: "2026-11-26",
      sent: 299,
      limit: 300,
      reserve: 30,
    }),
  ];
  // Todos los eventos tienen su muestra.
  const missing = EMAIL_EVENTS.filter((event) => !samples.some((s) => s.event === event));
  if (missing.length > 0) throw new Error(`Faltan muestras: ${missing.join(", ")}`);
  return samples;
}

export interface PreviewOptions {
  siteUrl: string;
  now: Date;
  contact?: string | null;
}

/** Renderiza una muestra con su contexto (enlaces con token falso y pie de ejemplo). */
export function renderPreview(sampleItem: PreviewSample, options: PreviewOptions): RenderedEmail {
  const ctx: RenderContext = {
    siteUrl: options.siteUrl,
    now: options.now,
    pickupDetails: PICKUP,
    contact: options.contact ?? "+56 9 0000 0000 · contacto@example.com (muestra)",
    passwordReset: {
      url: passwordResetUrl(options.siteUrl, PREVIEW_TOKEN),
      expiresAt: new Date(options.now.getTime() + 30 * 60_000),
    },
    unsubscribeUrl: newsletterUnsubscribeUrl(options.siteUrl, PREVIEW_TOKEN),
  };
  const data = parseEmailData(sampleItem.event, sampleItem.data);
  const email = renderEmail(sampleItem.event, data, ctx);
  return { ...email, subject: `${PREVIEW_SUBJECT_PREFIX}${email.subject}` };
}

/**
 * Registra un envío de muestra en email_log y email_attempts, sin trabajo en
 * outbox: así cuenta en el límite diario y el panel lo muestra como «Muestra».
 */
export async function recordPreviewSend(
  prisma: Pick<PrismaClient, "$transaction">,
  input: { slug: string; event: EmailEvent; recipient: string; result: SendResult; at: Date },
): Promise<void> {
  const { result } = input;
  const status =
    result.outcome === "accepted" ? "sent" : result.outcome === "timeout" ? "uncertain" : "failed";
  await prisma.$transaction(async (tx) => {
    const log = await tx.emailLog.create({
      data: {
        event: input.event,
        recipient: input.recipient.trim().toLowerCase(),
        eventKey: `${PREVIEW_KEY_PREFIX}${randomUUID()}:${input.slug}`.slice(0, 160),
        status,
        providerMessageId: result.outcome === "accepted" ? result.messageId : null,
        createdAt: input.at,
      },
    });
    await tx.emailAttempt.create({
      data: {
        emailId: log.id,
        kind: "automatic",
        result:
          result.outcome === "accepted"
            ? "sent"
            : result.outcome === "timeout"
              ? "timeout"
              : "failed",
        detail: result.outcome === "accepted" ? "Correo de muestra" : result.detail.slice(0, 500),
        createdAt: input.at,
      },
    });
  });
}
