import type { ComponentType } from "react";

import { SectionHeading } from "@/shared/ui/section-heading";

import { BlogHeight, BlogMontessori, BlogOrder } from "../illustrations";

const ARTICLES: {
  topic: string;
  topicColor: string;
  tint: string;
  title: string;
  text: string;
  Art: ComponentType<{ className?: string }>;
}[] = [
  {
    topic: "Montessori",
    topicColor: "text-brand-purple",
    tint: "bg-soft-purple",
    title: "Cómo armar un dormitorio Montessori paso a paso",
    text: "Qué muebles priorizar y cómo ubicarlos para fomentar la independencia.",
    Art: BlogMontessori,
  },
  {
    topic: "Guía de compra",
    topicColor: "text-brand-blue",
    tint: "bg-soft-blue",
    title: "Altura ideal de mesa y silla según la edad",
    text: "Una tabla simple para elegir el tamaño correcto y cuidar su postura.",
    Art: BlogHeight,
  },
  {
    topic: "Orden",
    topicColor: "text-brand-green",
    tint: "bg-soft-green",
    title: "5 ideas para ordenar juguetes y ganar autonomía",
    text: "Rutinas y muebles que hacen que guardar sea parte del juego.",
    Art: BlogOrder,
  },
];

/**
 * Ideas para papás y educadores. Los artículos aún no tienen pantalla propia en el
 * inventario aprobado, así que se muestran sin enlace (ver nota en ARCHITECTURE.md).
 */
export function Ideas() {
  return (
    <section aria-labelledby="ideas" className="mx-auto max-w-7xl px-4 pt-14 pb-6 sm:px-6">
      <SectionHeading
        id="ideas"
        eyebrow="Rincón de papás y educadores"
        eyebrowTone="purple"
        title="Ideas para crecer jugando"
      />
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
        {ARTICLES.map(({ Art, ...article }) => (
          <li key={article.title}>
            <article className="flex h-full flex-col overflow-hidden rounded-[28px] bg-surface shadow-[0_2px_0_var(--color-border)]">
              <div className={`flex h-40 items-center justify-center ${article.tint}`}>
                <Art className="h-30 w-50" />
              </div>
              <div className="flex flex-col gap-2 px-6 pt-5 pb-6">
                <p
                  className={`text-[13px] font-extrabold tracking-[1px] uppercase ${article.topicColor}`}
                >
                  {article.topic}
                </p>
                <h3 className="text-[22px] leading-tight font-bold">{article.title}</h3>
                <p className="text-[15px] text-text-secondary">{article.text}</p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
