import type { ReactNode } from "react";

import { site } from "@/shared/config/site";
import { HeartIcon, LeafIcon, SchoolIcon, TruckIcon } from "@/shared/ui/icons";

const ITEMS: { icon: ReactNode; tint: string; title: string; text: string }[] = [
  {
    icon: <TruckIcon size={26} className="text-brand-blue" />,
    tint: "bg-soft-blue",
    title: "Despacho o retiro en taller",
    text: "Coordinamos la entrega contigo",
  },
  {
    icon: <LeafIcon size={26} className="text-brand-green" />,
    tint: "bg-soft-green",
    title: "Terminaciones seguras",
    text: site.safetyCertification,
  },
  {
    icon: <SchoolIcon size={26} className="text-yellow-ink" />,
    tint: "bg-cream",
    title: "Ventas a instituciones",
    text: "Jardines, salas cuna y colegios",
  },
  {
    icon: <HeartIcon size={26} className="text-brand-red" />,
    tint: "bg-soft-red",
    title: "Asesoría personalizada",
    text: "Te ayudamos a elegir por edad",
  },
];

/** Franja de confianza bajo el banner. */
export function TrustStrip() {
  return (
    <section
      aria-label="Por qué comprar en Total Kids"
      className="mx-auto max-w-7xl px-4 pt-2 pb-6 sm:px-6"
    >
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-5 rounded-[28px] bg-surface px-7 py-6 shadow-[0_2px_0_var(--color-border)]">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex items-center gap-3.5">
            <span
              className={`flex size-13 shrink-0 items-center justify-center rounded-2xl ${item.tint}`}
            >
              {item.icon}
            </span>
            <span>
              <strong className="block font-extrabold">{item.title}</strong>
              <span className="text-sm text-text-secondary">{item.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
