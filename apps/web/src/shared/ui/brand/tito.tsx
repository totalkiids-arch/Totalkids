/**
 * Tito, la mascota de Total Kids: un cubo amarillo con un bloque "A" sobre la cabeza.
 * Por defecto es decorativo; pasa `label` cuando aporta significado.
 */
interface TitoProps {
  className?: string;
  /** Texto alternativo. Si se omite, Tito es decorativo (aria-hidden). */
  label?: string;
  /** Flota suavemente. Se desactiva si el usuario prefiere menos movimiento. */
  animated?: boolean;
}

export function Tito({ className = "w-[120px]", label, animated = false }: TitoProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg
      viewBox="0 0 120 150"
      className={`${className} ${animated ? "motion-safe:animate-float" : ""}`}
      {...a11y}
    >
      {/* Bloque "A" */}
      <rect x="40" y="2" width="40" height="24" rx="8" className="fill-brand-red" />
      <text
        x="60"
        y="20"
        textAnchor="middle"
        className="fill-white font-heading text-[16px] font-extrabold"
      >
        A
      </text>
      {/* Brazos */}
      <path
        d="M16 70 Q2 58 8 40"
        className="stroke-brand-navy"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M104 74 Q118 84 112 100"
        className="stroke-brand-navy"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      {/* Piernas y zapatos */}
      <rect x="44" y="110" width="10" height="28" rx="4" className="fill-brand-navy" />
      <rect x="66" y="110" width="10" height="28" rx="4" className="fill-brand-navy" />
      <ellipse cx="48" cy="140" rx="11" ry="6" className="fill-brand-blue" />
      <ellipse cx="72" cy="140" rx="11" ry="6" className="fill-brand-blue" />
      {/* Cuerpo */}
      <rect
        x="14"
        y="24"
        width="92"
        height="92"
        rx="22"
        className="fill-brand-yellow"
        stroke="#e0a92a"
        strokeWidth="4"
      />
      {/* Ojos */}
      <circle cx="44" cy="62" r="8" className="fill-brand-navy" />
      <circle cx="76" cy="62" r="8" className="fill-brand-navy" />
      <circle cx="47" cy="59" r="3" className="fill-white" />
      <circle cx="79" cy="59" r="3" className="fill-white" />
      {/* Mejillas y sonrisa */}
      <circle cx="32" cy="82" r="7" fill="#ff9f80" />
      <circle cx="88" cy="82" r="7" fill="#ff9f80" />
      <path
        d="M46 82 Q60 98 74 82"
        className="stroke-brand-navy"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
