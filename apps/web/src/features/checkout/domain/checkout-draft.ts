import { z } from "zod";

import { CHECKOUT_FIELDS, type CheckoutField, type CheckoutInput } from "./checkout-details";

/**
 * Borrador del paso "Datos y facturación": lo que el comprador escribió, tal
 * cual, para volver a llenar el formulario y para que el paso de pago lo lea.
 *
 * Se guarda como texto del formulario (no como datos ya normalizados) y se
 * vuelve a validar con `parseCheckoutDetails` cada vez que se lee: lo guardado
 * nunca se da por bueno. Tiene datos personales, así que la cookie es httpOnly
 * y dura poco. Con la API, el borrador pasa a ser el pedido en estado "creado".
 */
export const CHECKOUT_COOKIE = "tk_checkout";
export const CHECKOUT_COOKIE_MAX_AGE = 60 * 60 * 2; // 2 horas

export type CheckoutValues = Partial<Record<CheckoutField, string>>;

const FIELDS = Object.values(CHECKOUT_FIELDS) as CheckoutField[];
/** Tope generoso por campo: la validación real (con sus límites) es parseCheckoutDetails. */
const MAX_VALUE = 400;

/** Toma solo los campos conocidos y con texto; descarta archivos y otros valores. */
export function pickCheckoutValues(input: CheckoutInput): CheckoutValues {
  const values: CheckoutValues = {};
  for (const field of FIELDS) {
    const value = input[field];
    if (typeof value === "string" && value !== "") values[field] = value.slice(0, MAX_VALUE);
  }
  return values;
}

const Stored = z.object({ v: z.literal(1), d: z.record(z.string(), z.unknown()) });

export function serializeCheckoutDraft(values: CheckoutValues): string {
  return JSON.stringify({ v: 1, d: values });
}

/** Lee la cookie. Un formato irreconocible es un borrador vacío. */
export function parseCheckoutDraft(raw: string | undefined): CheckoutValues {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  const parsed = Stored.safeParse(data);
  return parsed.success ? pickCheckoutValues(parsed.data.d) : {};
}
