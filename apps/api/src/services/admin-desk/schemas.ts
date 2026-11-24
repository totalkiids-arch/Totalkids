import { z } from "zod";

import { paginationQuery } from "../../lib/pagination.js";
import { SERVICE_IDS } from "../service-requests.js";

/** Esquemas de entrada de solicitudes y suscriptores del panel (LN-16). */

export const REQUEST_STATUSES = ["new", "in_progress", "resolved"] as const;
export const NOTE_MAX = 1000;

/** `{id}` de una solicitud: su uuid o su referencia visible ("SOL-1002" o "1002"). */
export type RequestRef = { id: string } | { number: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^(?:sol-?)?(\d{1,9})$/i;

export function parseRequestRef(value: string): RequestRef | null {
  const text = value.trim();
  if (UUID.test(text)) return { id: text.toLowerCase() };
  const match = NUMBER.exec(text);
  return match ? { number: Number(match[1]) } : null;
}

export const requestParams = z.object({
  id: z.string().transform((value, ctx): RequestRef => {
    const ref = parseRequestRef(value);
    if (!ref) {
      ctx.addIssue({ code: "custom", message: "Solicitud inválida" });
      return z.NEVER;
    }
    return ref;
  }),
});

/** Filtros del listado y de la exportación: `?service=&status=&q=`. */
export const requestFilters = z.object({
  service: z.enum(SERVICE_IDS, "Servicio inválido").optional(),
  status: z.enum(REQUEST_STATUSES, "Estado inválido").optional(),
  /** Referencia, nombre o correo, sin tildes ni mayúsculas. */
  q: z.string().trim().max(80).optional(),
});
export type RequestFilters = z.output<typeof requestFilters>;

export const requestListQuery = paginationQuery.extend(requestFilters.shape);
export type RequestListQuery = z.output<typeof requestListQuery>;

export const followUpBody = z
  .strictObject({
    status: z.enum(REQUEST_STATUSES, "Elige un estado de la lista.").optional(),
    /** Nota interna (solo la ve el equipo). "" la borra. */
    note: z.string("Escribe la nota como texto.").max(5000).optional(),
  })
  .refine((b) => b.status !== undefined || b.note !== undefined, "No hay cambios para guardar.");
export type FollowUpInput = z.output<typeof followUpBody>;

// ── Suscriptores ─────────────────────────────────────────────────────────────

export const subscriberFilters = z.object({
  status: z.enum(["active", "unsubscribed"], "Estado inválido").optional(),
  /** Parte del correo. */
  q: z.string().trim().max(80).optional(),
});
export type SubscriberFilters = z.output<typeof subscriberFilters>;

export const subscriberListQuery = paginationQuery.extend(subscriberFilters.shape);
export type SubscriberListQuery = z.output<typeof subscriberListQuery>;

export const subscriberParams = z.object({ id: z.uuid("Identificador inválido") });
