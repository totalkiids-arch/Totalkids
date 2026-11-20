import type { Consent } from "./subscription";

/**
 * Suscriptores del newsletter en el panel (RF-25, RF-29, RF-35). Dominio puro.
 *
 * - Cada suscriptor guarda el correo, la fecha del consentimiento y la versión
 *   del texto aceptado (CONSENT_VERSION al suscribirse).
 * - La baja no borra el registro: cambia el estado y deja la fecha de baja y
 *   quién la registró (el propio suscriptor o el administrador).
 * - Volver a suscribirse reactiva el mismo registro con un consentimiento nuevo.
 */

export const SUBSCRIBER_STATUSES = ["active", "unsubscribed"] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const SUBSCRIBER_STATUS_LABEL: Record<SubscriberStatus, string> = {
  active: "Activo",
  unsubscribed: "Dado de baja",
};

/** Actor cuando la baja llega desde el formulario público. */
export const SUBSCRIBER_ACTOR = "Suscriptor";

export interface Subscriber {
  id: string;
  /** En minúsculas. */
  email: string;
  consentedAt: string;
  consentVersion: string;
  status: SubscriberStatus;
  unsubscribedAt: string | null;
  unsubscribedBy: string | null;
}

/** Alta o reactivación con el consentimiento recién aceptado. */
export function subscribeWithConsent(
  existing: Subscriber | null,
  id: string,
  email: string,
  consent: Consent,
): Subscriber {
  return {
    id: existing?.id ?? id,
    email,
    consentedAt: consent.acceptedAt,
    consentVersion: consent.version,
    status: "active",
    unsubscribedAt: null,
    unsubscribedBy: null,
  };
}

export type UnsubscribeOutcome =
  { ok: true; subscriber: Subscriber } | { ok: false; reason: "already-unsubscribed" };

/** Registra la baja sin borrar el registro. Una baja repetida no cambia la fecha original. */
export function registerUnsubscribe(
  subscriber: Subscriber,
  actor: string,
  now: string,
): UnsubscribeOutcome {
  if (subscriber.status === "unsubscribed") return { ok: false, reason: "already-unsubscribed" };
  return {
    ok: true,
    subscriber: {
      ...subscriber,
      status: "unsubscribed",
      unsubscribedAt: now,
      unsubscribedBy: actor,
    },
  };
}

// ── Listado: filtros de la URL ───────────────────────────────────────────────

/** Valor del filtro en la URL (`?estado=activos|bajas`). */
export const SUBSCRIBER_FILTERS = { activos: "active", bajas: "unsubscribed" } as const;
export type SubscriberFilter = keyof typeof SUBSCRIBER_FILTERS;

export interface SubscriberQuery {
  filter: SubscriberFilter | null;
  /** Suscriptor cuya baja se está confirmando (`?baja=<id>`). */
  confirm: string | null;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export function parseSubscriberQuery(params: Params): SubscriberQuery {
  const filter = first(params.estado);
  const confirm = first(params.baja);
  return {
    filter: Object.hasOwn(SUBSCRIBER_FILTERS, filter) ? (filter as SubscriberFilter) : null,
    confirm: /^[\w-]{1,40}$/.test(confirm) ? confirm : null,
  };
}

/** Los que cumplen el filtro, del consentimiento más reciente al más antiguo. */
export function filterSubscribers(
  subscribers: readonly Subscriber[],
  filter: SubscriberFilter | null,
): Subscriber[] {
  const status = filter ? SUBSCRIBER_FILTERS[filter] : null;
  return subscribers
    .filter((s) => !status || s.status === status)
    .sort((a, b) => Date.parse(b.consentedAt) - Date.parse(a.consentedAt));
}

/**
 * Exportación (RF-29, solo Administrador). Solo lo necesario para demostrar el
 * consentimiento: correo, fecha, versión, estado y fecha de baja.
 */
export function subscribersCsvTable(
  subscribers: readonly Subscriber[],
  formatDate: (iso: string) => string,
) {
  return {
    header: ["Correo", "Fecha de consentimiento", "Versión del texto", "Estado", "Fecha de baja"],
    rows: subscribers.map((s) => [
      s.email,
      formatDate(s.consentedAt),
      s.consentVersion,
      SUBSCRIBER_STATUS_LABEL[s.status],
      s.unsubscribedAt ? formatDate(s.unsubscribedAt) : "",
    ]),
  };
}
