import { z } from "zod";

import { findService, isServiceId, type ServiceId } from "./services";

/**
 * Solicitud de servicio especial (RF-24). Dominio puro.
 *
 * `parseServiceRequest` recibe los valores del formulario (texto) y devuelve la
 * solicitud normalizada o un error por campo, listo para mostrar. La política
 * de privacidad se acepta con una casilla que NO viene marcada.
 */

/** Nombres de los campos del formulario. La pantalla y la validación usan los mismos. */
export const REQUEST_FIELDS = {
  service: "servicio",
  name: "nombre",
  email: "correo",
  phone: "telefono",
  commune: "comuna",
  ages: "edades",
  date: "fecha",
  message: "mensaje",
  privacy: "privacidad",
} as const;

export type RequestField = (typeof REQUEST_FIELDS)[keyof typeof REQUEST_FIELDS];

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

export interface ServiceRequest {
  service: ServiceId;
  name: string;
  /** En minúsculas. */
  email: string;
  /** "+56XXXXXXXXX" o null. */
  phone: string | null;
  commune: string | null;
  /** Edad de los niños, en texto libre ("3 y 6 años"). */
  ages: string | null;
  /** Fecha preferida "AAAA-MM-DD" o null. */
  preferredDate: string | null;
  message: string;
}

export type RequestErrors = Partial<Record<RequestField, string>>;

export type RequestParseResult =
  { ok: true; request: ServiceRequest } | { ok: false; errors: RequestErrors };

const F = REQUEST_FIELDS;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usa como máximo ${max} caracteres.`)
    .optional()
    .transform((v) => v || null);

/**
 * @param today Fecha de hoy "AAAA-MM-DD" (la entrega quien llama, para que la
 *   regla sea pura y se pueda probar): la fecha preferida no puede ser anterior.
 */
function schema(today: string) {
  return z.object({
    [F.service]: z.string().refine(isServiceId, "Elige el servicio que te interesa."),
    [F.name]: z
      .string("Ingresa tu nombre.")
      .trim()
      .min(1, "Ingresa tu nombre.")
      .max(120, "Usa como máximo 120 caracteres."),
    [F.email]: z
      .string("Ingresa tu correo.")
      .trim()
      .min(1, "Ingresa tu correo.")
      .max(254, "Usa como máximo 254 caracteres.")
      .pipe(z.email("Escribe un correo válido, por ejemplo nombre@correo.cl."))
      .transform((v) => v.toLowerCase()),
    [F.phone]: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v.replace(/[\s().-]/g, "") : ""))
      .refine(
        (v) => v === "" || /^(?:\+?56)?\d{9}$/.test(v),
        "Escribe un teléfono de 9 dígitos, por ejemplo +56 9 1234 5678.",
      )
      .transform((v) => (v ? `+56${v.slice(-9)}` : null)),
    [F.commune]: optional(60),
    [F.ages]: optional(60),
    [F.date]: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Elige una fecha válida.")
      .refine((v) => !v || v >= today, "Elige una fecha desde hoy en adelante.")
      .transform((v) => v || null),
    [F.message]: z
      .string("Cuéntanos qué necesitas.")
      .trim()
      .min(1, "Cuéntanos qué necesitas.")
      .min(MESSAGE_MIN, `Cuéntanos un poco más (al menos ${MESSAGE_MIN} caracteres).`)
      .max(MESSAGE_MAX, `Usa como máximo ${MESSAGE_MAX} caracteres.`),
    [F.privacy]: z
      .unknown()
      .refine(
        (v) => v === "on" || v === "true",
        "Acepta la política de privacidad para enviar la solicitud.",
      ),
  });
}

/** Valores crudos del formulario (p. ej. `Object.fromEntries(formData)`). */
export function parseServiceRequest(
  input: Partial<Record<string, unknown>>,
  today: string,
): RequestParseResult {
  // Solo los campos conocidos y con texto: archivos u otros valores se ignoran.
  const values = Object.fromEntries(
    Object.values(F).map((field) => {
      const value = input[field];
      return [field, typeof value === "string" ? value : undefined];
    }),
  );
  const parsed = schema(today).safeParse(values);
  if (!parsed.success) {
    const errors: RequestErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as RequestField | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return { ok: false, errors };
  }
  const d = parsed.data;
  return {
    ok: true,
    request: {
      service: d[F.service] as ServiceId,
      name: d[F.name],
      email: d[F.email],
      phone: d[F.phone],
      commune: d[F.commune],
      ages: d[F.ages],
      preferredDate: d[F.date],
      message: d[F.message],
    },
  };
}

/** Nombre del servicio para la confirmación ("Armado e instalación"). */
export function requestServiceTitle(request: Pick<ServiceRequest, "service">): string {
  return findService(request.service).title;
}

/** Lo escrito en el formulario, para volver a llenarlo cuando hay errores. */
export type RequestValues = Partial<Record<RequestField, string>>;

/** Toma solo los campos conocidos y con texto, acotados al máximo del mensaje. */
export function pickRequestValues(input: Partial<Record<string, unknown>>): RequestValues {
  const values: RequestValues = {};
  for (const field of Object.values(F)) {
    const value = input[field];
    if (typeof value === "string" && value !== "") values[field] = value.slice(0, MESSAGE_MAX);
  }
  return values;
}
