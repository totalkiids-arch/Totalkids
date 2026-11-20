import { z } from "zod";

import { isRegionCode, type RegionCode } from "@/shared/config/regions";
import { formatRut, isValidRut } from "./rut";

/**
 * Datos y facturación del checkout (RF-09, RF-10, RF-11): comprador, entrega
 * (despacho o retiro) y documento tributario (boleta o factura). Dominio puro.
 *
 * `parseCheckoutDetails` recibe los valores del formulario tal como llegan
 * (texto) y devuelve los datos normalizados o un error por campo, con mensajes
 * listos para mostrar. Lo usa la Server Action del paso "Datos y facturación".
 */

/** Nombres de los campos del formulario. La pantalla y la validación usan los mismos. */
export const CHECKOUT_FIELDS = {
  name: "nombre",
  rut: "rut",
  email: "correo",
  phone: "telefono",
  delivery: "entrega",
  region: "region",
  commune: "comuna",
  street: "direccion",
  unit: "depto",
  notes: "indicaciones",
  document: "documento",
  companyRut: "empresa_rut",
  businessName: "razon_social",
  activity: "giro",
  invoiceEmail: "factura_correo",
  invoiceAddress: "factura_direccion",
  invoiceCommune: "factura_comuna",
  purchaseOrder: "orden_compra",
} as const;

export type CheckoutField = (typeof CHECKOUT_FIELDS)[keyof typeof CHECKOUT_FIELDS];

export const DELIVERY_METHODS = ["domicilio", "retiro"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const TAX_DOCUMENTS = ["boleta", "factura"] as const;
export type TaxDocument = (typeof TAX_DOCUMENTS)[number];

export interface Buyer {
  name: string;
  /** Formato "12.345.678-5". */
  rut: string;
  /** En minúsculas. */
  email: string;
  /** Formato E.164: "+56912345678". */
  phone: string;
}

export type Delivery =
  | {
      method: "domicilio";
      region: RegionCode;
      commune: string;
      street: string;
      unit: string | null;
      notes: string | null;
    }
  | { method: "retiro" };

export type Billing =
  | { document: "boleta" }
  | {
      document: "factura";
      rut: string;
      businessName: string;
      activity: string;
      email: string;
      address: string;
      commune: string;
      /** El comprador necesita orden de compra o cotización formal (compras públicas). */
      purchaseOrder: boolean;
    };

export interface CheckoutDetails {
  buyer: Buyer;
  delivery: Delivery;
  billing: Billing;
}

export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

export type CheckoutParseResult =
  { ok: true; details: CheckoutDetails } | { ok: false; errors: CheckoutErrors };

/** Valores crudos del formulario (p. ej. `Object.fromEntries(formData)`). */
export type CheckoutInput = Partial<Record<string, unknown>>;

const F = CHECKOUT_FIELDS;

const required = (message: string, max = 120) =>
  z.string(message).trim().min(1, message).max(max, `Usa como máximo ${max} caracteres.`);

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usa como máximo ${max} caracteres.`)
    .optional()
    .transform((v) => v || null);

const rut = (message: string) =>
  z
    .string(message)
    .trim()
    .min(1, message)
    .refine(isValidRut, "Revisa el RUT: el dígito verificador no coincide.")
    .transform(formatRut);

const email = (message: string) =>
  z
    .string(message)
    .trim()
    .min(1, message)
    .max(254, "Usa como máximo 254 caracteres.")
    .pipe(z.email("Escribe un correo válido, por ejemplo nombre@correo.cl."))
    .transform((v) => v.toLowerCase());

/** Celular o fijo chileno: 9 dígitos, con o sin +56. Se guarda como "+56XXXXXXXXX". */
const phone = z
  .string("Ingresa tu teléfono.")
  .trim()
  .min(1, "Ingresa tu teléfono.")
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .refine(
    (v) => /^(?:\+?56)?\d{9}$/.test(v),
    "Escribe un teléfono de 9 dígitos, por ejemplo +56 9 1234 5678.",
  )
  .transform((v) => `+56${v.slice(-9)}`);

const buyerSchema = z.object({
  [F.name]: required("Ingresa tu nombre y apellido."),
  [F.rut]: rut("Ingresa tu RUT."),
  [F.email]: email("Ingresa tu correo electrónico."),
  [F.phone]: phone,
});

const shippingSchema = z.object({
  [F.region]: z.string().refine(isRegionCode, "Elige una región."),
  [F.commune]: required("Ingresa la comuna.", 60),
  [F.street]: required("Ingresa la calle y el número.", 160),
  [F.unit]: optional(60),
  [F.notes]: optional(300),
});

const invoiceSchema = z.object({
  [F.companyRut]: rut("Ingresa el RUT de la empresa."),
  [F.businessName]: required("Ingresa la razón social.", 160),
  [F.activity]: required("Ingresa el giro.", 120),
  [F.invoiceEmail]: email("Ingresa el correo para facturas."),
  [F.invoiceAddress]: required("Ingresa la dirección comercial.", 160),
  [F.invoiceCommune]: required("Ingresa la comuna.", 60),
  [F.purchaseOrder]: z
    .unknown()
    .optional()
    .transform((v) => v === "on" || v === "true" || v === true),
});

/** Primer mensaje de cada campo (el formulario muestra uno a la vez). */
function collect(errors: CheckoutErrors, error: z.ZodError) {
  for (const issue of error.issues) {
    const field = issue.path[0] as CheckoutField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
}

/** Texto del formulario o undefined (los campos vacíos llegan como ""). */
const asText = (value: unknown) => (typeof value === "string" ? value : undefined);

export function parseCheckoutDetails(input: CheckoutInput): CheckoutParseResult {
  const values = Object.fromEntries(
    Object.values(F).map((field) => [field, asText(input[field])]),
  ) as Record<CheckoutField, string | undefined>;
  const errors: CheckoutErrors = {};

  const buyer = buyerSchema.safeParse(values);
  if (!buyer.success) collect(errors, buyer.error);

  const method = values[F.delivery];
  if (!DELIVERY_METHODS.includes(method as DeliveryMethod)) {
    errors[F.delivery] = "Elige cómo quieres recibir tu pedido.";
  }
  const shipping = method === "domicilio" ? shippingSchema.safeParse(values) : null;
  if (shipping && !shipping.success) collect(errors, shipping.error);

  const document = values[F.document];
  if (!TAX_DOCUMENTS.includes(document as TaxDocument)) {
    errors[F.document] = "Elige boleta o factura.";
  }
  const invoice = document === "factura" ? invoiceSchema.safeParse(values) : null;
  if (invoice && !invoice.success) collect(errors, invoice.error);

  if (Object.keys(errors).length > 0 || !buyer.success) {
    return { ok: false, errors };
  }

  const delivery: Delivery =
    shipping?.success === true
      ? {
          method: "domicilio",
          region: shipping.data[F.region] as RegionCode,
          commune: shipping.data[F.commune],
          street: shipping.data[F.street],
          unit: shipping.data[F.unit],
          notes: shipping.data[F.notes],
        }
      : { method: "retiro" };

  const billing: Billing =
    invoice?.success === true
      ? {
          document: "factura",
          rut: invoice.data[F.companyRut],
          businessName: invoice.data[F.businessName],
          activity: invoice.data[F.activity],
          email: invoice.data[F.invoiceEmail],
          address: invoice.data[F.invoiceAddress],
          commune: invoice.data[F.invoiceCommune],
          purchaseOrder: invoice.data[F.purchaseOrder],
        }
      : { document: "boleta" };

  return {
    ok: true,
    details: {
      buyer: {
        name: buyer.data[F.name],
        rut: buyer.data[F.rut],
        email: buyer.data[F.email],
        phone: buyer.data[F.phone],
      },
      delivery,
      billing,
    },
  };
}
