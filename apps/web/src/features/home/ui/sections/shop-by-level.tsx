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
    label: "Sala cuna, 0 a 2 años",
    title: "Sala cuna",
    text: "Cunas, mudadores, sillas de ingesta y equipamiento Pikler para los primeros movimientos.",
    href: "/catalogo?nivel=sala-cuna",
    card: "bg-soft-blue",
    accent: "text-brand-blue",
    link: "text-brand-blue",
  },
  {
    range: "2–4",
    label: "Nivel medio, 2 a 4 años",
    title: "Nivel medio",
    text: "Sillas y mesas párvulo, libreros a su altura y triángulos para trepar.",
    href: "/catalogo?nivel=nivel-medio",
    card: "bg-soft-red",
    accent: "text-brand-red",
    link: "text-brand-red-deep",
  },
  {
    range: "4–6",
    label: "Transición, 4 a 6 años",
    title: "Transición",
    text: "Sillas infantiles, mesas de trabajo, estantes escolares y roperos.",
    href: "/catalogo?nivel=transicion",
    card: "bg-soft-green",
    accent: "text-brand-green",
    link: "text-brand-green",
  },
  {
    range: "+",
    label: "Educadoras y adultos",
    title: "Educadoras",
    text: "Escritorios, cajoneras, estantes docentes y sillas de adulto para el aula.",
    href: "/catalogo?nivel=adultos",
    card: "bg-soft-purple",
    accent: "text-brand-purple",
    link: "text-brand-purple",
  },
];

/** Accesos al catálogo por nivel educativo (sala cuna, nivel medio, transición, docentes). */
export function ShopByLevel() {
  return (
    <section aria-labelledby="por-nivel" className="mx-auto max-w-7xl px-4 pt-12 pb-6 sm:px-6">
      <SectionHeading
        id="por-nivel"
        eyebrow="Cada nivel, su mueble"
        eyebrowTone="red"
        title="Compra por nivel"
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
