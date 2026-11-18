import type { ReactNode } from "react";

import { BookIcon, ChildIcon, GridIcon, PencilIcon } from "@/shared/ui/icons";

import { PhilosophyBlocks } from "../illustrations";

const PILLARS: { icon: ReactNode; tint: string; title: string; text: string }[] = [
  {
    icon: <ChildIcon size={28} className="text-yellow-ink" />,
    tint: "bg-cream",
    title: "Autonomía",
    text: "Camas bajas y torres de aprendizaje para que hagan las cosas por sí mismos.",
  },
  {
    icon: <GridIcon size={28} className="text-brand-green" />,
    tint: "bg-soft-green",
    title: "Orden y clasificación",
    text: "Organizadores por colores que convierten guardar juguetes en un juego.",
  },
  {
    icon: <PencilIcon size={28} className="text-brand-red" />,
    tint: "bg-soft-red",
    title: "Creatividad",
    text: "Mesas lavables y atriles para dibujar, pintar y escribir sin miedo a ensuciar.",
  },
  {
    icon: <BookIcon size={28} className="text-brand-purple" />,
    tint: "bg-soft-purple",
    title: "Amor por la lectura",
    text: "Libreros frontales que muestran las portadas y despiertan la curiosidad.",
  },
];

/** "Aprender jugando, desde el mueble": la filosofía de la marca. */
export function Philosophy() {
  return (
    <section aria-labelledby="filosofia" className="mx-auto max-w-7xl px-4 pt-16 pb-6 sm:px-6">
      <div className="on-dark relative overflow-hidden rounded-[28px] bg-brand-blue px-6 py-10 text-white sm:rounded-[40px] sm:px-12 sm:py-14">
        <PhilosophyBlocks className="absolute -top-7.5 -right-7.5 size-55 opacity-15" />
        <div className="relative mb-9 max-w-[640px]">
          <p className="text-sm font-extrabold tracking-[2px] text-brand-yellow uppercase">
            Nuestra filosofía
          </p>
          <h2
            id="filosofia"
            className="mt-1.5 mb-3 text-[clamp(2.125rem,4.5vw,2.875rem)] leading-[1.05] font-extrabold text-white"
          >
            Aprender jugando, desde el mueble
          </h2>
          <p className="text-lg text-on-blue">
            Un espacio a su medida les da libertad para elegir, ordenar y crear. Así cada mueble se
            convierte en una herramienta de aprendizaje.
          </p>
        </div>
        <ul className="relative grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-5">
          {PILLARS.map((pillar) => (
            <li
              key={pillar.title}
              className="flex flex-col gap-2.5 rounded-3xl bg-surface p-6 text-text-primary"
            >
              <span
                className={`flex size-14 items-center justify-center rounded-[18px] ${pillar.tint}`}
              >
                {pillar.icon}
              </span>
              <h3 className="text-[22px] font-extrabold">{pillar.title}</h3>
              <p className="text-[15px] text-text-secondary">{pillar.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
