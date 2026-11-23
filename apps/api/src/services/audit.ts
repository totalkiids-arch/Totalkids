import type { Prisma } from "../generated/prisma/client.js";
import { errors } from "../lib/errors.js";
import type { PanelSession } from "./auth.js";
import { ROLE_LABEL } from "./auth.js";

/** Quién hace un cambio desde el panel, como se guarda en audit_log e inventory_movements. */
export interface Actor {
  actorUserId: string;
  actorLabel: string;
}

/** Actor de la sesión del panel; 401 si no hay (no debería pasar detrás de requirePanel). */
export function actorOf(panel: PanelSession | undefined): Actor {
  if (!panel) throw errors.unauthorized("Debes iniciar sesión en el panel");
  return { actorUserId: panel.user.id, actorLabel: ROLE_LABEL[panel.user.role] };
}

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId: string;
  /** Resumen depurado de lo que cambió (antes/después). */
  details?: Prisma.InputJsonValue;
  reason?: string | null;
}

/** Agrega una fila a audit_log (append-only) dentro de la transacción del cambio. */
export async function writeAudit(
  tx: Pick<Prisma.TransactionClient, "auditLog">,
  actor: Actor,
  entry: AuditEntry,
  requestId?: string,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: actor.actorUserId,
      actorLabel: actor.actorLabel,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      details: entry.details ?? {},
      reason: entry.reason ?? null,
      requestId: requestId ?? null,
    },
  });
}
