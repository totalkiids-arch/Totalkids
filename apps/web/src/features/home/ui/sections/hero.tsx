import { Tito } from "@/shared/ui/brand/tito";
import { ButtonLink } from "@/shared/ui/button";
import { ArrowRightIcon } from "@/shared/ui/icons";

import { HeroRoom } from "../illustrations";

/**
 * Banner principal. Provisional: cuando existan banners administrables (RF-28, UI-03)
 * este contenido vendrá del panel y podrá rotar.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto max-w-7xl px-4 pt-6 pb-6 sm:px-6 sm:pt-10"
    >
      <div className="relative flex flex-wrap items-center gap-6 overflow-hidden rounded-[28px] bg-soft-yellow px-6 py-7 sm:gap-8 sm:rounded-[40px] sm:p-12">
        <div className="relative flex min-w-0 flex-[1_1_420px] flex-col gap-5">
          <p className="flex items-center gap-2 self-start rounded-full bg-surface px-4 py-2 text-[13px] font-extrabold tracking-[1.5px] text-text-primary uppercase">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-brand-green" />
            Mobiliario infantil · Hogar y educación
          </p>
          <h1
            id="hero-title"
            className="text-[clamp(2.5rem,12.5vw,3.25rem)] leading-[1.02] font-extrabold sm:text-[clamp(3.25rem,5.5vw,4rem)]"
          >
            Muebles que invitan a{" "}
            <span className="inline-block -rotate-2 rounded-xl bg-surface px-2 text-brand-red shadow-[0_5px_0_var(--color-ochre)] sm:rounded-2xl sm:px-3 lg:whitespace-nowrap">
              aprender jugando
            </span>
          </h1>
          <p className="max-w-[520px] text-[17px] text-text-body sm:text-[19px]">
            Mesas, camas casita, libreros frontales y organizadores a la altura de los niños,
            pensados para que exploren, ordenen y crezcan con autonomía.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <ButtonLink href="/catalogo" size="lg">
              Ver catálogo
              <ArrowRightIcon size={20} />
            </ButtonLink>
            <ButtonLink href="/servicios/solicitar" variant="light" size="lg">
              Cotizar para jardines
            </ButtonLink>
          </div>
        </div>

        <div className="relative flex min-w-0 flex-[1_1_440px] justify-center">
          <div className="absolute bottom-0 left-0 z-10 flex items-end gap-1 motion-safe:animate-float">
            <Tito label="Tito, la mascota de Total Kids, saludando" className="w-20 sm:w-[120px]" />
            <p className="mb-16 max-w-40 rounded-[20px_20px_20px_4px] bg-surface px-4 py-2.5 font-heading text-base leading-tight font-extrabold shadow-[0_4px_0_var(--color-ochre)] sm:mb-24 sm:text-lg">
              ¡Hola! Soy Tito. ¿Jugamos a decorar?
            </p>
          </div>
          <HeroRoom
            label="Sala infantil con librero, mesa con sillas y bloques de letras"
            className="h-auto w-full max-w-[560px]"
          />
        </div>
      </div>
    </section>
  );
}
