import { z } from "zod";

/**
 * Consulta de pedido invitado (RF-36): quien compró sin cuenta ve su pedido con
 * el número y el correo de la compra. Dominio puro.
 *
 * Ambos datos deben coincidir. Si no, la respuesta es siempre la misma, para
 * no revelar qué números de pedido existen ni a qué correo pertenecen.
 */

export const LOOKUP_FIELDS = { orderId: "pedido", email: "correo" } as const;

export const LOOKUP_NOT_FOUND =
  "No encontramos un pedido con ese número y correo. Revisa el correo de confirmación de tu compra.";

export type LookupResult =
  | { ok: true; orderId: string; email: string }
  | { ok: false; errors: { pedido?: string; correo?: string } };

/** "tk-1048", "#TK-1048", "1048" → "TK-1048"; null si no tiene forma de número de pedido. */
export function normalizeOrderId(value: string): string | null {
  const match = /^#?\s*(?:tk\s*-?\s*)?(\d{1,10})$/i.exec(value.trim());
  return match ? `TK-${match[1]}` : null;
}

const Schema = z.object({
  pedido: z
    .string("Ingresa el número de pedido.")
    .trim()
    .min(1, "Ingresa el número de pedido.")
    .max(20, "Revisa el número de pedido, por ejemplo TK-1048.")
    .transform((v, ctx) => {
      const id = normalizeOrderId(v);
      if (!id)
        ctx.addIssue({
          code: "custom",
          message: "Revisa el número de pedido, por ejemplo TK-1048.",
        });
      return id ?? "";
    }),
  correo: z
    .string("Ingresa el correo de la compra.")
    .trim()
    .min(1, "Ingresa el correo de la compra.")
    .max(254, "Usa como máximo 254 caracteres.")
    .pipe(z.email("Escribe un correo válido, por ejemplo nombre@correo.cl."))
    .transform((v) => v.toLowerCase()),
});

export function parseGuestLookup(input: Partial<Record<string, unknown>>): LookupResult {
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  const parsed = Schema.safeParse({
    pedido: text(input[LOOKUP_FIELDS.orderId]),
    correo: text(input[LOOKUP_FIELDS.email]),
  });
  if (parsed.success) {
    return { ok: true, orderId: parsed.data.pedido, email: parsed.data.correo };
  }
  const errors: { pedido?: string; correo?: string } = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as "pedido" | "correo" | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/**
 * Quién puede ver un pedido: el dueño con sesión iniciada, o quien lo consultó
 * como invitado con número y correo correctos.
 */
export function canViewOrder(
  order: { id: string; email: string },
  viewer: { sessionEmail: string | null; guestOrderIds: readonly string[] },
): boolean {
  if (viewer.sessionEmail !== null && viewer.sessionEmail === order.email) return true;
  return viewer.guestOrderIds.includes(order.id);
}

/**
 * Pedidos que este navegador consultó como invitado. Se guardan en una cookie
 * httpOnly de corta duración para no poner el correo en la URL.
 */
export const GUEST_COOKIE = "tk_pedido_invitado";
export const GUEST_COOKIE_MAX_AGE = 60 * 60; // 1 hora
export const MAX_GUEST_ORDERS = 5;

export function serializeGuestAccess(ids: readonly string[]): string {
  return ids.slice(-MAX_GUEST_ORDERS).join(".");
}

export function parseGuestAccess(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(".")
    .filter((id) => /^TK-\d{1,10}$/.test(id))
    .slice(-MAX_GUEST_ORDERS);
}

/** Agrega un pedido consultado sin repetir y con tope. */
export function grantGuestAccess(ids: readonly string[], id: string): string[] {
  return [...ids.filter((x) => x !== id), id].slice(-MAX_GUEST_ORDERS);
}
