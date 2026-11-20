import type { ReactNode } from "react";

/** Colores de la maqueta; cada par texto/fondo cumple contraste 4,5:1 (RNF-09). */
const TONES = {
  green: "bg-soft-green text-brand-green",
  yellow: "bg-cream text-yellow-ink",
  red: "bg-soft-red text-brand-red-deep",
  blue: "bg-soft-blue text-brand-blue",
  neutral: "border border-chip-border bg-surface text-text-secondary",
} as const;

export type StatusTone = keyof typeof TONES;

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-[5px] px-2.5 py-1 text-xs font-extrabold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Activo / Inactivo, el estado de publicación más común del panel. */
export function ActiveBadge({
  active,
  feminine = false,
}: {
  active: boolean;
  /** Concordancia con el registro: "Activa" para una zona o una categoría. */
  feminine?: boolean;
}) {
  const ending = feminine ? "a" : "o";
  return (
    <StatusBadge tone={active ? "green" : "red"}>
      {active ? `Activ${ending}` : `Inactiv${ending}`}
    </StatusBadge>
  );
}
