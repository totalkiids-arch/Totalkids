import { randomUUID } from "node:crypto";

import type { Prisma } from "../src/generated/prisma/client.js";
import { CSRF_COOKIE_DEV, issueCsrfToken } from "../src/lib/csrf.js";
import type { PrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { PANEL_COOKIE_DEV } from "../src/middleware/panel-auth.js";
import { createStaffUser, login } from "../src/services/auth.js";
import { testEnv } from "./helpers.js";

const PASSWORD = "contraseña-segura-del-taller";

/** Crea una cuenta del equipo y abre su sesión del panel (LN-04). */
export async function panelSession(prisma: PrismaClient, role: "admin" | "operator") {
  const email = `${role}-${randomUUID()}@ejemplo.cl`;
  const user = await createStaffUser(prisma, { email, name: "Equipo", role, password: PASSWORD });
  const { token } = await login(prisma, { email, password: PASSWORD });
  return { user, token };
}

/**
 * Cookies de la sesión del panel y, si `csrf`, el par CSRF atado a esa sesión
 * (cookie + X-CSRF-Token), como las manda Next.js.
 */
export function panelHeaders(panelToken?: string, csrf = true): Record<string, string> {
  const token = issueCsrfToken(testEnv.CSRF_SECRET ?? "", panelToken ? hashToken(panelToken) : "");
  const cookies = csrf ? [`${CSRF_COOKIE_DEV}=${token}`] : [];
  if (panelToken) cookies.push(`${PANEL_COOKIE_DEV}=${panelToken}`);
  return { cookie: cookies.join("; "), ...(csrf ? { "x-csrf-token": token } : {}) };
}

class Rollback extends Error {}

/**
 * Cliente de Prisma atado a una transacción: cada `$transaction` del código
 * probado se vuelve un SAVEPOINT, así un error deshace solo esa operación (como
 * en producción) y nada queda visible para otras conexiones.
 */
function savepointClient(tx: Prisma.TransactionClient): PrismaClient {
  let counter = 0;
  const $transaction = async (fn: (inner: Prisma.TransactionClient) => Promise<unknown>) => {
    counter += 1;
    const name = `tk_sp_${String(counter)}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
    try {
      const result = await fn(tx);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (err) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
      throw err;
    }
  };
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === "$transaction") return $transaction;
      return Reflect.get(target, prop, receiver) as unknown;
    },
  }) as unknown as PrismaClient;
}

/**
 * Corre `fn` dentro de una transacción que se deshace al final. Los tests del
 * catálogo admin la usan para no tocar los conteos exactos de catalog.db.test.ts,
 * que corre en paralelo contra la misma base (igual que catalog-categories).
 */
export async function inRollback(
  prisma: PrismaClient,
  fn: (db: PrismaClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(savepointClient(tx));
        throw new Rollback();
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
}
