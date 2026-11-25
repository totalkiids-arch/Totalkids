import { z } from "zod";

import { isRegionCode, regionName } from "@/shared/config/regions";
import { unavailableError } from "@/shared/lib/panel-errors";

import { ACTIVITY_AREAS, isActivityArea, type ActivityPage } from "../domain/activity";

/*
 * Traducción de GET /admin/activity (apps/api/openapi.yaml) al panel. Puro (sin
 * server-only ni Next.js) para poder probarlo. Un cuerpo inesperado cuenta como
 * API no disponible.
 */

const int = z.number().int();

const ApiActivityPage = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      area: z.string().nullable(),
      description: z.string(),
      reason: z.string().nullable(),
      actorName: z.string().nullable(),
      actorLabel: z.string(),
      reference: z.object({ type: z.string(), id: z.string(), label: z.string() }).nullable(),
    }),
  ),
  meta: z.object({ page: int, total: int, totalPages: int }),
  actors: z.array(
    z.object({ id: z.string(), name: z.string(), role: z.string(), active: z.boolean() }),
  ),
  byArea: z.record(z.string(), int),
});

export function toActivityPage(body: unknown): ActivityPage {
  const parsed = ApiActivityPage.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  const data = parsed.data;
  return {
    entries: data.items.map((e) => ({
      id: e.id,
      at: e.at,
      // Un área que esta versión del panel no conoce se muestra sin etiqueta.
      area: isActivityArea(e.area) ? e.area : null,
      description: e.description,
      reason: e.reason,
      actorName: e.actorName,
      actorLabel: e.actorLabel,
      reference: e.reference,
    })),
    total: data.meta.total,
    page: data.meta.page,
    pageCount: Math.max(1, data.meta.totalPages),
    actors: data.actors,
    byArea: Object.fromEntries(
      ACTIVITY_AREAS.map((area) => [area, data.byArea[area] ?? 0]),
    ) as ActivityPage["byArea"],
  };
}

/**
 * La API nombra la referencia de una zona de despacho con su id (no hay
 * `name` en los detalles de auditoría de la zona). ¿Hay alguna así en la página?
 */
export const needsZoneNames = (page: ActivityPage) =>
  page.entries.some(
    (e) => e.reference?.type === "shipping_zone" && e.reference.label === e.reference.id,
  );

const ApiZoneNames = z.object({
  items: z.array(z.object({ id: z.string(), region: z.string(), commune: z.string() })),
});

/** id de la zona → "Ñuñoa (Región Metropolitana)", desde GET /admin/shipping-zones. */
export function toZoneNames(body: unknown): Map<string, string> {
  const parsed = ApiZoneNames.safeParse(body);
  if (!parsed.success) return new Map();
  return new Map(
    parsed.data.items.map((z) => [
      z.id,
      `${z.commune} (${isRegionCode(z.region) ? regionName(z.region) : z.region})`,
    ]),
  );
}

/**
 * Pone el nombre de la comuna en las referencias a zonas de despacho. Si la zona
 * no aparece (o no se pudo consultar), un texto genérico: nunca el id.
 */
export function withZoneNames(
  page: ActivityPage,
  names: ReadonlyMap<string, string>,
): ActivityPage {
  return {
    ...page,
    entries: page.entries.map((entry) => {
      const ref = entry.reference;
      if (ref?.type !== "shipping_zone" || ref.label !== ref.id) return entry;
      return { ...entry, reference: { ...ref, label: names.get(ref.id) ?? "zona de despacho" } };
    }),
  };
}
