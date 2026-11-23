import { Router } from "express";
import { z } from "zod";

import { formatRut, isValidRut, normalizePhone, REGION_CODES } from "../domain/checkout.js";
import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { cartToken } from "../middleware/cart-session.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { createOrder, type CreateOrderInput } from "../services/orders.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const rut = z
  .string()
  .trim()
  .max(20)
  .refine(isValidRut, "RUT inválido: revisa el dígito verificador")
  .transform(formatRut);

const email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email("Correo inválido"))
  .transform((v) => v.toLowerCase());

const phone = z
  .string()
  .trim()
  .max(20)
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Teléfono de 9 dígitos, p. ej. +56 9 1234 5678" });
      return z.NEVER;
    }
    return normalized;
  });

const orderBody = z.object({
  buyer: z.object({ name: text(120), rut, email, phone }),
  delivery: z.discriminatedUnion("method", [
    z.object({ method: z.literal("retiro") }),
    z.object({
      method: z.literal("despacho"),
      region: z.enum(REGION_CODES),
      commune: text(80),
      street: text(160),
      unit: optionalText(60),
      notes: optionalText(300),
    }),
  ]),
  billing: z.discriminatedUnion("document", [
    z.object({ document: z.literal("boleta") }),
    z.object({
      document: z.literal("factura"),
      rut,
      businessName: text(160),
      activity: text(120),
      email,
      address: text(160),
      commune: text(60),
      purchaseOrder: z.boolean().default(false),
    }),
  ]),
  /** Aceptación de las condiciones de compra, despacho y privacidad (RNF-13). */
  termsAccepted: z.literal(true, "Debes aceptar las condiciones para comprar"),
});

/** Idempotency-Key: 16 a 128 caracteres seguros (UUID v4 recomendado). */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Pedidos de invitado (LN-09). Crear exige la cookie del carrito, CSRF
 * (middleware global) e Idempotency-Key.
 */
export function ordersRouter({
  prisma,
  isProduction,
  accessSecret,
}: {
  prisma: PrismaClient;
  isProduction: boolean;
  /** Secreto del servidor para la credencial X-Order-Access. */
  accessSecret: string;
}): Router {
  const router = Router();

  router
    .route("/orders")
    .post(
      validated({ body: orderBody }, async ({ body }, req, res) => {
        const key = req.get("idempotency-key") ?? "";
        if (!IDEMPOTENCY_KEY.test(key)) {
          throw errors.validation("Falta la cabecera Idempotency-Key o no es válida", {
            issues: [
              {
                location: "headers",
                path: "Idempotency-Key",
                message: "Usa un identificador único de 16 a 128 caracteres (p. ej. un UUID)",
              },
            ],
          });
        }
        const { termsAccepted: _accepted, ...input } = body;
        const { status, order } = await createOrder(prisma, {
          cartToken: cartToken(req, isProduction),
          idempotencyKey: key,
          input: input as CreateOrderInput,
          accessSecret,
        });
        res.status(status).json(order);
      }),
    )
    .all(methodNotAllowed("POST"));

  return router;
}
