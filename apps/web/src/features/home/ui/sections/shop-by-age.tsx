import Link from "next/link";
import type { Route } from "next";

import { ArrowRightIcon } from "@/shared/ui/icons";
import { SectionHeading } from "@/shared/ui/section-heading";

const STAGES: {
  range: string;
  label: string;
  title: string;
  text: string;
  href: Route;
  card: string;
  accent: string;
  link: string;
}[] = [
  {
    range: "0–2",
    label: "0 a 2 años",
    title: "Primeros pasos",
    text: "Cunas, camas suelo Montessori, espejos y gimnasios de gateo.",
    href: "/catalogo?edad=0-2",
    card: "bg-soft-blue",
    accent: "text-brand-blue",
    link: "text-brand-blue",
  },
  {
    range: "3–5",
    label: "3 a 5 años",
    title: "Exploradores",
    text: "Mesas con sillas, camas casita, libreros frontales y torres de aprendizaje.",
    href: "/catalogo?edad=3-5",
    card: "bg-soft-red",
    accent: "text-brand-red",
    link: "text-brand-red-deep",
  },
  {
    range: "6–9",
    label: "6 a 9 años",
    title: "Pequeños estudiantes",
    text: "Escritorios regulables, sillas ergonómicas y organizadores de cubos.",
    href: "/catalogo?edad=6-9",
    card: "bg-soft-green",
    accent: "text-brand-green",
    link: "text-brand-green",
  },
  {
    range: "10+",
    label: "10 años o más",
    title: "Grandes ideas",
    text: "Camas nido, repisas, escritorios de estudio y almacenamiento.",
    href: "/catalogo?edad=10",
    card: "bg-soft-purple",
    accent: "text-brand-purple",
    link: "text-brand-purple",
  },
];

/** Accesos al catálogo por etapa de edad. */
export function ShopByAge() {
  return (
    <section aria-labelledby="por-edad" className="mx-auto max-w-7xl px-4 pt-12 pb-6 sm:px-6">
      <SectionHeading
        id="por-edad"
        eyebrow="Cada etapa, su mueble"
        eyebrowTone="red"
        title="Compra por edad"
        aside={
          <p className="max-w-[420px] text-text-secondary">
            La altura correcta de mesa, silla y estante hace la diferencia en postura, seguridad y
            autonomía.
          </p>
        }
      />
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5">
        {STAGES.map((stage) => (
          <li key={stage.range}>
            <Link
              href={stage.href}
              className={`flex min-h-55 flex-col gap-2 rounded-[28px] p-7 text-text-primary motion-safe:transition motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_14px_30px_-12px_rgb(31_42_68/0.25)] ${stage.card}`}
            >
              <span
                aria-hidden
                className={`font-heading text-[64px] leading-none font-extrabold ${stage.accent}`}
              >
                {stage.range}
              </span>
              <span className="sr-only">{stage.label}:</span>
              <strong className="text-xl font-extrabold">{stage.title}</strong>
              <span className="text-[15px] text-text-body">{stage.text}</span>
              <span className={`mt-auto flex items-center gap-1.5 font-extrabold ${stage.link}`}>
                Ver muebles
                <ArrowRightIcon size={18} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
