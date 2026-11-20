/** Formatos y textos compartidos por las pantallas de catálogo del panel. */

type Params = Record<string, string | string[] | undefined>;

export type AdminSearchParams = Params;

/** Primer valor de un parámetro de la URL ("" si no está). */
export function param(params: Params, name: string): string {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const DATE_TIME = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

/** "19-11-2026, 23:10" en hora de Chile. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function units(n: number): string {
  return `${n} un.`;
}

/** Aviso fijo de las pantallas del catálogo administrable. */
export const DEMO_STORE_NOTE =
  "Datos de demostración: los cambios viven en la memoria del servidor, se pierden al reiniciar y todavía no se reflejan en la tienda pública. La API real llega en LN-12.";
