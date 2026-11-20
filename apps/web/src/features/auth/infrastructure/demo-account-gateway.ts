import "server-only";

import type { AccountGateway } from "../application/ports";
import { nameFromEmail } from "../domain/session";

/** Cuenta de ejemplo con pedidos (ver orders/infrastructure/demo-orders.ts). */
export const DEMO_ACCOUNT = { name: "Camila González", email: "camila@example.com" } as const;

/**
 * Adaptador de DEMOSTRACIÓN (hasta LN-04): no guarda cuentas ni verifica
 * contraseñas y no envía correos. Cualquier correo y contraseña inician una
 * sesión de ejemplo; las pantallas lo informan.
 */
export const demoAccountGateway: AccountGateway = {
  async login(email) {
    return email === DEMO_ACCOUNT.email
      ? { ...DEMO_ACCOUNT }
      : { name: nameFromEmail(email), email };
  },
  async register(name, email) {
    return { name, email };
  },
  async requestRecovery() {},
  async resetPassword(token) {
    return token.length > 0;
  },
};
