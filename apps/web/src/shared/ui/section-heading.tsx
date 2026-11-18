import type { ReactNode } from "react";

const EYEBROW_TONE = {
  red: "text-brand-red",
  green: "text-brand-green",
  purple: "text-brand-purple",
  yellow: "text-brand-yellow",
} as const;

interface SectionHeadingProps {
  id: string;
  eyebrow: string;
  eyebrowTone: keyof typeof EYEBROW_TONE;
  title: string;
  /** Contenido a la derecha (descripción, filtros o enlace). */
  aside?: ReactNode;
}

/** Encabezado de sección de la portada: antetítulo de color + título + complemento. */
export function SectionHeading({ id, eyebrow, eyebrowTone, title, aside }: SectionHeadingProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p
          className={`text-sm font-extrabold tracking-[2px] uppercase ${EYEBROW_TONE[eyebrowTone]}`}
        >
          {eyebrow}
        </p>
        <h2 id={id} className="mt-1 text-[clamp(2rem,4vw,2.625rem)] leading-tight font-extrabold">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}
