import { Prisma } from "../../generated/prisma/client.js";
import { errors } from "../../lib/errors.js";
import type { ValidationIssue } from "../../lib/validation.js";

/** Problemas de reglas de negocio con el mismo formato que `validated()` (422). */
export class Issues {
  readonly list: ValidationIssue[] = [];

  add(path: string, message: string): void {
    // Un mensaje por campo, como el panel.
    if (this.list.some((issue) => issue.path === path)) return;
    this.list.push({ location: "body", path, message });
  }

  throwIfAny(message = "Los datos enviados no son válidos"): void {
    if (this.list.length > 0) throw errors.validation(message, { issues: this.list });
  }
}

/** Violación de un índice único (P2002): otra petición se adelantó con el mismo SKU o slug. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Disponible = físico − reservado, nunca negativo (RN-03). */
export function available(variant: { stockPhysical: number; stockReserved: number }): number {
  return Math.max(0, variant.stockPhysical - variant.stockReserved);
}

/** Campos que cambiaron entre dos objetos, como `{ campo: { before, after } }` para audit_log. */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: readonly (keyof T & string)[],
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    if (!(key in after) || after[key] === undefined) continue;
    const a = before[key] instanceof Date ? (before[key] as Date).toISOString() : before[key];
    const b = after[key] instanceof Date ? (after[key] as Date).toISOString() : after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { before: a, after: b };
  }
  return changes;
}
