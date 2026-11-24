/**
 * Política de contraseñas del panel (RNF-01): la misma de la API
 * (apps/api/src/lib/passwords.ts, PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH).
 * password-policy.test.ts compara estos valores con la API y con el contrato
 * (openapi.yaml) y falla si alguno cambia sin el otro.
 *
 * La API vuelve a validar: esto solo evita un viaje con un dato que no pasará.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_HINT = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Puedes usar una frase.`;

export interface NewPasswordErrors {
  password?: string;
  confirmation?: string;
}

/** Valida la contraseña nueva y su repetición antes de enviarla a la API. */
export function checkNewPassword(password: string, confirmation: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  if (password.length < PASSWORD_MIN_LENGTH)
    errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
  else if (password.length > PASSWORD_MAX_LENGTH)
    errors.password = `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`;
  else if (password.trim().length === 0)
    errors.password = "La contraseña no puede ser solo espacios";
  if (!errors.password && password !== confirmation)
    errors.confirmation = "Las contraseñas no coinciden";
  return errors;
}
