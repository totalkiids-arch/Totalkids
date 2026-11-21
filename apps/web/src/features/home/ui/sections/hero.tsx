import type { Route } from "next";
import type { ComponentType } from "react";

import { ButtonLink } from "@/shared/ui/button";
import { Carousel, type CarouselSlide } from "@/shared/ui/carousel";
import { ArrowRightIcon } from "@/shared/ui/icons";

import { BearScene, ElephantScene, GiraffeScene, LionScene, MonkeyScene } from "../animal-scenes";

export interface HeroSlideData {
  id: string;
  animal: string;
  background: string;
  eyebrow: string;
  title: string;
  highlight: string;
  /** Color del texto destacado (todos cumplen AA sobre blanco). */
  highlightClass: string;
  body: string;
  primary: { href: Route; label: string };
  secondary?: { href: Route; label: string };
  bubble: string;
  Scene: ComponentType<{ className?: string; label: string }>;
  sceneLabel: string;
}

/**
 * Diapositivas del banner principal. Provisional: cuando existan banners
 * administrables (RF-28, UI-13) el texto y los enlaces vendrán del panel.
 */
const SLIDES: readonly HeroSlideData[] = [
  {
    id: "jirafa",
    animal: "Jirafa",
    background: "bg-soft-yellow",
    eyebrow: "Mobiliario infantil · Hogar y educación",
    title: "Muebles que invitan a",
    highlight: "aprender jugando",
    highlightClass: "text-brand-red",
    body: "Mesas, camas casita, libreros frontales y organizadores a la altura de los niños, pensados para que exploren, ordenen y crezcan con autonomía.",
    primary: { href: "/catalogo", label: "Ver catálogo" },
    secondary: { href: "/servicios/solicitar", label: "Cotizar para jardines" },
    bubble: "¡Le doy color a tu librero!",
    Scene: GiraffeScene,
    sceneLabel: "La jirafa del logo pinta un librero frontal con una brocha",
  },
  {
    id: "leon",
    animal: "León",
    background: "bg-soft-red",
    eyebrow: "Camas y cunas",
    title: "Camas casita para",
    highlight: "soñar en grande",
    highlightClass: "text-brand-purple",
    body: "Estructuras de madera a ras de suelo para que suban y bajen solos, con un techo que convierte la hora de dormir en juego.",
    primary: { href: "/catalogo?categoria=cunas", label: "Ver cunas y camas" },
    bubble: "¡Tac, tac! Techo listo.",
    Scene: LionScene,
    sceneLabel: "El león del logo clava el techo de una cama casita con un martillo",
  },
  {
    id: "elefante",
    animal: "Elefante",
    background: "bg-soft-green",
    eyebrow: "Mesas y sillas",
    title: "Mesas y sillas",
    highlight: "a su medida",
    highlightClass: "text-brand-green",
    body: "Alturas pensadas para cada edad: pies en el suelo y espalda apoyada para dibujar, comer y armar.",
    primary: { href: "/catalogo?categoria=mesas", label: "Ver mesas" },
    bubble: "¡Pinto con la trompa!",
    Scene: ElephantScene,
    sceneLabel: "El elefante del logo pinta una mesa con una brocha en la trompa",
  },
  {
    id: "oso",
    animal: "Oso",
    background: "bg-soft-purple",
    eyebrow: "Almacenamiento",
    title: "Cada juguete",
    highlight: "en su lugar",
    highlightClass: "text-brand-purple",
    body: "Cubos y baúles a su alcance para que ordenar sea parte del juego.",
    primary: { href: "/catalogo?categoria=almacenamiento", label: "Ver almacenamiento" },
    bubble: "Este cubo va aquí.",
    Scene: BearScene,
    sceneLabel: "El oso del logo guarda cubos de colores en un organizador",
  },
  {
    id: "mono",
    animal: "Mono",
    background: "bg-soft-blue",
    eyebrow: "Jardines y colegios",
    title: "Equipamos salas",
    highlight: "de punta a punta",
    highlightClass: "text-brand-blue",
    body: "Mesas, sillas y libreros resistentes para jardines infantiles, salas cuna y colegios, con cotización a medida.",
    primary: { href: "/servicios/solicitar", label: "Cotizar para mi institución" },
    secondary: { href: "/catalogo?categoria=junji", label: "Ver línea JUNJI" },
    bubble: "Lijo bien los bordes.",
    Scene: MonkeyScene,
    sceneLabel: "El mono del logo lija el respaldo de una silla",
  },
];

function HeroSlide({ slide }: { slide: HeroSlideData }) {
  const { Scene } = slide;
  return (
    <div className="flex h-full flex-wrap content-start items-center gap-6 px-6 pt-7 pb-24 sm:content-center sm:gap-8 sm:px-12 sm:pt-12 sm:pb-28">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
        <p className="flex items-center gap-2 self-start rounded-full bg-surface px-4 py-2 text-[13px] font-extrabold tracking-[1.5px] text-text-primary uppercase">
          <span aria-hidden className="size-2.5 rounded-[3px] bg-brand-green" />
          {slide.eyebrow}
        </p>
        <h2 className="text-[clamp(2.5rem,12.5vw,3.25rem)] leading-[1.02] font-extrabold sm:text-[clamp(3.25rem,5.5vw,4rem)]">
          {slide.title}{" "}
          <span
            className={`inline-block -rotate-2 rounded-xl bg-surface px-2 shadow-[0_5px_0_var(--color-ochre)] sm:rounded-2xl sm:px-3 lg:whitespace-nowrap ${slide.highlightClass}`}
          >
            {slide.highlight}
          </span>
        </h2>
        <p className="max-w-[520px] text-[17px] text-text-body sm:text-[19px]">{slide.body}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href={slide.primary.href} size="lg">
            {slide.primary.label}
            <ArrowRightIcon size={20} />
          </ButtonLink>
          {slide.secondary ? (
            <ButtonLink href={slide.secondary.href} variant="light" size="lg">
              {slide.secondary.label}
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <div className="relative flex min-w-0 flex-[1_1_440px] justify-center">
        <p className="absolute top-0 right-0 z-10 max-w-44 rounded-[20px_20px_4px_20px] bg-surface px-4 py-2.5 font-heading text-sm leading-tight font-extrabold shadow-[0_4px_0_var(--color-ochre)] sm:text-lg">
          <span className="sr-only">{slide.animal} dice: </span>
          {slide.bubble}
        </p>
        <Scene label={slide.sceneLabel} className="h-auto w-full max-w-[560px]" />
      </div>
    </div>
  );
}

/** Banner principal: carrusel con los animales del logo armando muebles.
 * Con una plantilla de campaña activa, su diapositiva abre el carrusel. */
export function Hero({ campaignSlide }: { campaignSlide?: HeroSlideData }) {
  const all = campaignSlide ? [campaignSlide, ...SLIDES] : SLIDES;
  const slides: CarouselSlide[] = all.map((slide) => ({
    id: slide.id,
    label: `${slide.eyebrow}: ${slide.title} ${slide.highlight}`,
    className: slide.background,
    content: <HeroSlide slide={slide} />,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-6 sm:px-6 sm:pt-10">
      <h1 className="sr-only">Total Kids: muebles infantiles que invitan a aprender jugando</h1>
      <Carousel
        label="Destacados de Total Kids"
        slides={slides}
        className="rounded-[28px] sm:rounded-[40px]"
      />
    </div>
  );
}
