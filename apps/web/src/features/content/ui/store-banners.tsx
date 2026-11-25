import { listPublishedBanners } from "../container";
import { BannerCard } from "./banner-card";

/**
 * Tienda · Banners de la portada (RF-28): los activos y vigentes que publica el
 * panel, en su orden. Sin banners (o si la API no responde) no se muestra nada.
 */
export async function StoreBanners() {
  const banners = await listPublishedBanners();
  if (banners.length === 0) return null;
  return (
    <section aria-label="Destacados" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <ul className="flex flex-col gap-4">
        {banners.map((banner) => (
          <li key={banner.id}>
            <BannerCard banner={banner} headingLevel={2} />
          </li>
        ))}
      </ul>
    </section>
  );
}
