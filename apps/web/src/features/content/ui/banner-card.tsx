import type { Route } from "next";

import { ButtonLink } from "@/shared/ui/button";

import { safeBannerHref, type StoreBanner } from "../domain/banner";

/**
 * Un banner tal como se ve en la portada: título, texto y enlace a una página
 * de la tienda. Lo usan la portada y la vista previa del panel.
 */
export function BannerCard({
  banner,
  headingLevel = 3,
}: {
  banner: StoreBanner;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-wrap items-center justify-between gap-5 rounded-[10px] bg-cream p-6">
      <div className="min-w-0 flex-1 basis-64">
        <Heading className="mb-2 font-heading text-2xl font-extrabold break-words sm:text-[30px] sm:leading-tight">
          {banner.title}
        </Heading>
        <p className="break-words text-on-yellow">{banner.text}</p>
      </div>
      <ButtonLink
        href={safeBannerHref(banner.href) as Route}
        variant="accent"
        aria-label={`Ver más: ${banner.title}`}
      >
        Ver más
      </ButtonLink>
    </div>
  );
}
