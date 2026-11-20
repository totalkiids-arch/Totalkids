import { z } from "zod";

/**
 * Formularios de la cuenta del comprador (RF-22): ingresar, crear cuenta,
 * recuperar acceso y restablecer contraseña. Dominio puro.
 *
 * Cada `parse…` recibe los valores del formulario (texto) y devuelve los datos
 * normalizados o un error por campo, listo para mostrar. Las contraseñas nunca
 * se recortan ni se transforman.
 */

export const AUTH_FIELDS = {
  name: "nombre",
  email: "correo",
  password: "clave",
  confirm: "confirmacion",
  privacy: "privacidad",
  token: "token",
} as const;

export type AuthField = (typeof AUTH_FIELDS)[keyof typeof AUTH_FIELDS];
export type AuthErrors = Partial<Record<AuthField, string>>;
export type AuthInput = Partial<Record<string, unknown>>;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

type Parsed<T> = { ok: true; data: T } | { ok: false; errors: AuthErrors };

const F = AUTH_FIELDS;

const email = z
  .string("Ingresa tu correo.")
  .trim()
  .min(1, "Ingresa tu correo.")
  .max(254, "Usa como máximo 254 caracteres.")
  .pipe(z.email("Escribe un correo válido, por ejemplo nombre@correo.cl."))
  .transform((v) => v.toLowerCase());

/** Al ingresar solo se exige que no esté vacía: las reglas se aplican al crearla. */
const currentPassword = z
  .string("Ingresa tu contraseña.")
  .min(1, "Ingresa tu contraseña.")
  .max(PASSWORD_MAX, `Usa como máximo ${PASSWORD_MAX} caracteres.`);

const newPassword = z
  .string("Elige una contraseña.")
  .min(1, "Elige una contraseña.")
  .min(PASSWORD_MIN, `Usa al menos ${PASSWORD_MIN} caracteres.`)
  .max(PASSWORD_MAX, `Usa como máximo ${PASSWORD_MAX} caracteres.`)
  .refine((v) => v.trim().length === v.length, "No empieces ni termines con espacios.");

const privacy = z
  .unknown()
  .refine(
    (v) => v === "on" || v === "true",
    "Acepta la política de privacidad para crear tu cuenta.",
  );

/** Solo los campos conocidos y con texto (los archivos u otros valores se ignoran). */
function texts(input: AuthInput): Record<AuthField, string | undefined> {
  return Object.fromEntries(
    Object.values(F).map((field) => {
      const value = input[field];
      return [field, typeof value === "string" ? value : undefined];
    }),
  ) as Record<AuthField, string | undefined>;
}

function run<T>(schema: z.ZodType<T>, input: AuthInput): Parsed<T> {
  const parsed = schema.safeParse(texts(input));
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: AuthErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as AuthField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

export function parseLogin(input: AuthInput): Parsed<{ email: string; password: string }> {
  return run(
    z
      .object({ [F.email]: email, [F.password]: currentPassword })
      .transform((d) => ({ email: d[F.email], password: d[F.password] })),
    input,
  );
}

export function parseRegistration(
  input: AuthInput,
): Parsed<{ name: string; email: string; password: string }> {
  return run(
    z
      .object({
        [F.name]: z
          .string("Ingresa tu nombre.")
          .trim()
          .min(1, "Ingresa tu nombre.")
          .max(120, "Usa como máximo 120 caracteres."),
        [F.email]: email,
        [F.password]: newPassword,
        [F.privacy]: privacy,
      })
      .transform((d) => ({ name: d[F.name], email: d[F.email], password: d[F.password] })),
    input,
  );
}

export function parseRecovery(input: AuthInput): Parsed<{ email: string }> {
  return run(
    z.object({ [F.email]: email }).transform((d) => ({ email: d[F.email] })),
    input,
  );
}

export function parsePasswordReset(input: AuthInput): Parsed<{ token: string; password: string }> {
  return run(
    z
      .object({
        [F.token]: z
          .string("El enlace no es válido. Pide uno nuevo.")
          .trim()
          .min(1, "El enlace no es válido. Pide uno nuevo.")
          .max(200, "El enlace no es válido. Pide uno nuevo."),
        [F.password]: newPassword,
        [F.confirm]: z.string("Repite tu contraseña.").min(1, "Repite tu contraseña."),
      })
      .refine((d) => d[F.password] === d[F.confirm], {
        path: [F.confirm],
        message: "Las contraseñas no coinciden.",
      })
      .transform((d) => ({ token: d[F.token], password: d[F.password] })),
    input,
  );
}

/** Lo escrito en el formulario, sin contraseñas, para volver a llenarlo con errores. */
export function pickSafeValues(input: AuthInput): Partial<Record<AuthField, string>> {
  const values: Partial<Record<AuthField, string>> = {};
  for (const field of [F.name, F.email] as const) {
    const value = input[field];
    if (typeof value === "string" && value !== "") values[field] = value.slice(0, 254);
  }
  return values;
}
