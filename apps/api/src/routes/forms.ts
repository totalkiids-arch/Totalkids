import { Router } from "express";
import { z } from "zod";

import { chileDate } from "../services/cart/chile-date.js";
import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { OPAQUE_TOKEN_PATTERN } from "../lib/secrets.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { createRateLimiter, publicFormLimiter } from "../middleware/rate-limit.js";
import { requestUnsubscribeLink, subscribe, unsubscribeWithToken } from "../services/newsletter.js";
import { createServiceRequest, SERVICE_IDS } from "../services/service-requests.js";

const MINUTE = 60 * 1000;

const email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email("Escribe un correo válido, por ejemplo nombre@correo.cl."))
  .transform((v) => v.toLowerCase());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usa como máximo ${String(max)} caracteres.`)
    .nullish()
    .transform((v) => v || null);

/** Teléfono chileno de 9 dígitos, con o sin +56; se guarda "+56XXXXXXXXX". */
const phone = z
  .string()
  .trim()
  .max(20)
  .nullish()
  .transform((v, ctx) => {
    const digits = (v ?? "").replace(/[\s().-]/g, "");
    if (digits === "") return null;
    if (!/^(?:\+?56)?\d{9}$/.test(digits)) {
      ctx.addIssue({
        code: "custom",
        message: "Escribe un teléfono de 9 dígitos, por ejemplo +56 9 1234 5678.",
      });
      return z.NEVER;
    }
    return `+56${digits.slice(-9)}`;
  });

const serviceRequestBody = z.object({
  service: z.enum(SERVICE_IDS, "Elige el servicio que te interesa."),
  name: z.string().trim().min(1, "Ingresa tu nombre.").max(120),
  email,
  phone,
  commune: optionalText(60),
  childrenAges: optionalText(60),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha válida.")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Elige una fecha válida.")
    // Se compara con el día de Chile al momento de la petición.
    .refine((v) => v >= chileDate(), "Elige una fecha desde hoy en adelante.")
    .nullish()
    .transform((v) => v ?? null),
  message: z
    .string()
    .trim()
    .min(10, "Cuéntanos un poco más (al menos 10 caracteres).")
    .max(2000, "Usa como máximo 2000 caracteres."),
  /** Aceptación de la política de privacidad: la casilla no viene marcada. */
  privacyAccepted: z.literal(true, "Acepta la política de privacidad para enviar la solicitud."),
});

const subscribeBody = z.object({
  email,
  /** Consentimiento explícito (RF-25): la casilla no viene marcada. */
  consent: z.literal(true, "Marca la casilla si quieres recibir nuestras novedades."),
  /** Versión del texto de consentimiento que vio la persona. */
  consentVersion: z.string().trim().min(1).max(40),
});

const unsubscribeLinkBody = z.object({ email });

const unsubscribeBody = z.object({
  token: z.string().regex(OPAQUE_TOKEN_PATTERN, "El enlace de baja no es válido."),
});

/** Límite por correo: evita llenar de enlaces de baja la bandeja de otra persona. */
const perEmail = (name: string, limit: number) =>
  createRateLimiter({
    name,
    windowMs: 60 * MINUTE,
    limit,
    keyGenerator: (req) => {
      const value: unknown = (req.body as { email?: unknown } | undefined)?.email;
      return typeof value === "string" ? `correo:${value.trim().toLowerCase()}` : "sin-correo";
    },
    message: "Ya pediste varios enlaces para este correo, intenta en una hora",
  });

/**
 * Formularios públicos (LN-08): solicitudes de servicio y newsletter. Sin
 * sesión; CSRF (middleware global) y límites por IP. Los limitadores se crean
 * por router: cada app tiene sus propios contadores.
 */
export function formsRouter(options: { prisma: PrismaClient; adminEmail: string }): Router {
  const { prisma, adminEmail } = options;
  const router = Router();

  router
    .route("/service-requests")
    .post(
      publicFormLimiter({ name: "service-requests" }),
      validated({ body: serviceRequestBody }, async ({ body }, _req, res) => {
        const { privacyAccepted: _accepted, ...input } = body;
        res.status(201).json(await createServiceRequest(prisma, input, { adminEmail }));
      }),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/newsletter")
    .post(
      publicFormLimiter({ name: "newsletter" }),
      validated({ body: subscribeBody }, async ({ body }, _req, res) => {
        await subscribe(prisma, body);
        res.status(202).end();
      }),
    )
    .all(methodNotAllowed("POST"));

  // Paso 1 de la baja: llega un correo con el enlace (si el correo está suscrito).
  router
    .route("/newsletter/unsubscribe-link")
    .post(
      publicFormLimiter({ name: "newsletter-unsubscribe-ip", limit: 5 }),
      perEmail("newsletter-unsubscribe-email", 3),
      validated({ body: unsubscribeLinkBody }, async ({ body }, _req, res) => {
        await requestUnsubscribeLink(prisma, body.email);
        res.status(202).end();
      }),
    )
    .all(methodNotAllowed("POST"));

  // Paso 2: el enlace del correo confirma la baja con su token.
  router
    .route("/newsletter/unsubscribe")
    .post(
      publicFormLimiter({ name: "newsletter-unsubscribe" }),
      validated({ body: unsubscribeBody }, async ({ body }, _req, res) => {
        if (!(await unsubscribeWithToken(prisma, body.token))) {
          throw errors.notFound("El enlace de baja no es válido o ya no está vigente.");
        }
        res.status(204).end();
      }),
    )
    .all(methodNotAllowed("POST"));

  return router;
}
