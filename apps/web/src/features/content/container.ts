// Raíz de composición de "content": conecta los puertos con sus adaptadores.
import type { BannerAdmin, PublishedBanners } from "./application/ports";
import { apiBannerAdmin } from "./infrastructure/api-banner-admin";
import { apiPublishedBanners, STORE_BANNERS_TAG } from "./infrastructure/api-published-banners";

export const bannerAdmin: BannerAdmin = apiBannerAdmin;

const publishedBanners: PublishedBanners = apiPublishedBanners;

/** Etiqueta de la caché de banners de la portada (la invalidan las acciones del panel). */
export { STORE_BANNERS_TAG };

/** Caso de uso: banners publicados para la portada (RF-28). Vacío si la API no responde. */
export function listPublishedBanners() {
  return publishedBanners.list();
}
