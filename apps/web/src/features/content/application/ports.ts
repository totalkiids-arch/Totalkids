import type { Banner, BannerInput, FieldErrors, StoreBanner } from "../domain/banner";

export type BannerResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

/**
 * Puerto: banners del panel (RF-28). Lo implementa la API (/admin/banners,
 * solo Administrador), que valida, registra el cambio y calcula lo que ve hoy
 * la tienda. Los banners no se eliminan: se activan o desactivan.
 */
export interface BannerAdmin {
  /** Por orden de aparición y luego por título (orden de la API). */
  list(): Promise<Banner[]>;
  /** id null crea un banner nuevo. */
  save(id: string | null, input: BannerInput): Promise<BannerResult<Banner>>;
  /** null si el banner ya no existe. */
  setActive(id: string, active: boolean): Promise<Banner | null>;
}

/**
 * Puerto: banners publicados en la portada (GET /banners, sin sesión). Si la
 * API no responde devuelve una lista vacía: la tienda nunca se cae por esto.
 */
export interface PublishedBanners {
  list(): Promise<StoreBanner[]>;
}
