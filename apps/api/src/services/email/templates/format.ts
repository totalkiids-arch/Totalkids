/**
 * Formato de los correos (SRS 4.4.3): importes en CLP, fechas en
 * America/Santiago y todo texto escapado antes de ir al HTML.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapa texto para HTML (contenido y atributos entre comillas). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** 12990 → "$12.990". */
export function formatClp(amount: number): string {
  return clp.format(amount);
}

const dateTime = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  dateStyle: "long",
  timeStyle: "short",
  hourCycle: "h23",
});

/** Fecha y hora en hora de Chile: "23 de noviembre de 2026 a las 14:30". */
export function formatDateTime(value: Date | string): string {
  return dateTime.format(typeof value === "string" ? new Date(value) : value);
}

/** Número visible del pedido: "TK-1048". */
export function orderRef(orderNumber: number): string {
  return `TK-${String(orderNumber)}`;
}

/** Referencia visible de la solicitud: "SOL-1002". */
export function requestRef(requestNumber: number): string {
  return `SOL-${String(requestNumber)}`;
}

/** URL absoluta a partir de PUBLIC_SITE_URL (sin barra final) y una ruta. */
export function siteLink(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${path}`;
}
