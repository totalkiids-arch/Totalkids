import { Router } from "express";
import { z } from "zod";

import { formatRut, isValidRut, normalizePhone, REGION_CODES } from "../domain/checkout.js";
import { errors } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { validated } from "../lib/validation.js";
import { cartToken } from "../middleware/cart-session.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import { publicFormLimiter } from "../middleware/rate-limit.js";
import { getGuestOrder, lookupOrder } from "../services/order-query.js";
import { createOrder, type CreateOrderInput } from "../services/orders.js";
import type { ShippingQuoter } from "../services/shipping/quoter.js";

const lookupBody = z.object({
  orderNumber: z.string().trim().min(1).max(20),
  email: z.string().trim().max(254).pipe(z.email("Correo inválido")),
});

// Un número mal formado responde 404 igual que uno inexistente (lo resuelve el servicio).
const orderParams = z.object({ orderNumber: z.string().max(40) });

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
  /**
   * Total que vio y confirmó el comprador (GET /shipping/quote → totals.total). El
   * carrito no guarda precios: si el de hoy no coincide, 409 y no se cobra (RN-02).
   */
  expectedTotal: z.number().int().min(0).max(1_000_000_000),
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
  quoter,
}: {
  prisma: PrismaClient;
  isProduction: boolean;
  /** Secreto del servidor para la credencial X-Order-Access. */
  accessSecret: string;
  /** Cotización de la entrega (el mismo puerto que GET /shipping/quote). */
  quoter: ShippingQuoter;
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
          quoter,
        });
        res.status(status).json(order);
      }),
    )
    .all(methodNotAllowed("POST"));

  // POST (no GET) para que el correo no quede en URLs ni logs. Límite por IP:
  // dificulta probar combinaciones de número y correo.
  router
    .route("/orders/lookup")
    .post(
      publicFormLimiter({ name: "order-lookup" }),
      validated({ body: lookupBody }, async ({ body }, _req, res) => {
        res.json(await lookupOrder(prisma, body, accessSecret));
      }),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/orders/:orderNumber")
    .get(
      validated({ params: orderParams }, async ({ params }, req, res) => {
        const credential = req.get("x-order-access") || undefined;
        res.json(await getGuestOrder(prisma, params.orderNumber, credential, accessSecret));
      }),
    )
    .all(methodNotAllowed("GET"));

  return router;
}
