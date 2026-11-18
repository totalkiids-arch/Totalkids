import { LogoMark } from "./logo-mark";

/**
 * Logo de Total Kids: isotipo en bloques (TK) + logotipo con cada letra del color
 * del logo ilustrado + lema "Aprender jugando". Fiel a la maqueta aprobada.
 *
 * Se anuncia a lectores de pantalla como "Total Kids"; las piezas son decorativas.
 */

const LETTERS = [
  ["T", "text-logo-orange"],
  ["O", "text-logo-sky"],
  ["T", "text-logo-green"],
  ["A", "text-logo-yellow"],
  ["L", "text-brand-purple"],
  [" ", ""],
  ["K", "text-brand-red"],
  ["I", "text-logo-sky"],
  ["D", "text-logo-yellow"],
  ["S", "text-logo-green"],
] as const;

const SIZES = {
  sm: { mark: "size-10", word: "text-[22px]", tagline: "text-[9px] tracking-[2px]" },
  md: { mark: "size-14", word: "text-[30px]", tagline: "text-xs tracking-[2.5px]" },
  lg: { mark: "size-20", word: "text-[44px]", tagline: "text-sm tracking-[3px]" },
} as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  /** Muestra el lema "Aprender jugando" bajo el logotipo. */
  withTagline?: boolean;
  /** Muestra solo el isotipo (TK), p. ej. en espacios reducidos. */
  markOnly?: boolean;
  className?: string;
}

export function Logo({
  size = "md",
  withTagline = true,
  markOnly = false,
  className = "",
}: LogoProps) {
  const s = SIZES[size];
  return (
    <span
      role="img"
      aria-label="Total Kids"
      className={`inline-flex items-center gap-3 ${className}`}
    >
      <LogoMark className={`${s.mark} shrink-0`} />
      {markOnly ? null : (
        <span aria-hidden className="flex flex-col leading-none">
          <span className={`font-heading font-extrabold tracking-[0.5px] whitespace-pre ${s.word}`}>
            {LETTERS.map(([letter, color], index) => (
              <span key={index} className={color}>
                {letter}
              </span>
            ))}
          </span>
          {withTagline ? (
            <span className={`mt-1 font-extrabold text-text-secondary uppercase ${s.tagline}`}>
              Aprender jugando
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
