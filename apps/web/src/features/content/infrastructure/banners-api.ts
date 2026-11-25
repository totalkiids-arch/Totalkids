import { z } from "zod";

import { unavailableError } from "@/shared/lib/panel-errors";

import {
  BANNER_VISIBILITIES,
  isInternalHref,
  type Banner,
  type BannerDraft,
  type StoreBanner,
} from "../domain/banner";

/*
 * Traducción de /admin/banners y /banners (apps/api/openapi.yaml). Puro (sin
 * server-only ni Next.js) para poder probarlo. En el panel, un cuerpo
 * inesperado cuenta como API no disponible.
 */

const ApiBanner = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  href: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  visibility: z.enum(BANNER_VISIBILITIES),
  visibilityLabel: z.string(),
});

const ApiBannerList = z.object({ items: z.array(ApiBanner) });

const ApiPublicBannerList = z.object({
  items: z.array(
    z.object({ id: z.string(), title: z.string(), text: z.string(), href: z.string() }),
  ),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unavailableError(parsed.error);
  return parsed.data;
}

const toBanner = ({ sortOrder, ...b }: z.infer<typeof ApiBanner>): Banner => ({
  ...b,
  order: sortOrder,
});

export const toBannerList = (body: unknown): Banner[] =>
  parse(ApiBannerList, body).items.map(toBanner);

export const toAdminBanner = (body: unknown): Banner => toBanner(parse(ApiBanner, body));

export function toApiBannerBody(draft: BannerDraft) {
  return {
    title: draft.title,
    text: draft.text,
    href: draft.href,
    sortOrder: draft.order,
    active: draft.active,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
  };
}

/**
 * Banners de la portada. Un cuerpo inesperado da una lista vacía, y un destino
 * que no sea una ruta interna se descarta (no se renderiza un enlace inseguro).
 */
export function toStoreBanners(body: unknown): StoreBanner[] {
  const parsed = ApiPublicBannerList.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.items
    .filter((b) => isInternalHref(b.href))
    .map(({ id, title, text, href }) => ({ id, title, text, href }));
}
