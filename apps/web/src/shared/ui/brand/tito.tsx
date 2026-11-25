/**
 * Tito, la mascota de Total Kids: un cubo amarillo con un bloque "A" sobre la cabeza.
 * Por defecto es decorativo; pasa `label` cuando aporta significado.
 */
interface TitoProps {
  className?: string;
  /** Texto alternativo. Si se omite, Tito es decorativo (aria-hidden). */
  label?: string;
  /**
   * Tito cobra vida: flota, saluda con la mano, parpadea, sonríe y el bloque "A"
   * rebota. Las animaciones viven en globals.css (`.tito--animated`) y se
   * desactivan si el usuario prefiere menos movimiento.
   */
  animated?: boolean;
}

export function Tito({ className = "w-[120px]", label, animated = false }: TitoProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg
      viewBox="0 0 120 150"
      className={`${className} ${animated ? "tito--animated motion-safe:animate-float" : ""}`}
      overflow="visible"
      {...a11y}
    >
      {/* Bloque "A" */}
      <g className="tito-block">
        <rect x="40" y="2" width="40" height="24" rx="8" className="fill-brand-red" />
        <text
          x="60"
          y="20"
          textAnchor="middle"
          className="fill-white font-heading text-[16px] font-extrabold"
        >
          A
        </text>
      </g>
      {/* Brazo que saluda: gira desde el hombro (16, 70) */}
      <g className="tito-arm-wave">
        <path
          d="M16 70 Q2 58 8 40"
          className="stroke-brand-navy"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="8" cy="38" r="5" className="fill-brand-navy" />
      </g>
      {/* Brazo de reposo */}
      <g className="tito-arm-rest">
        <path
          d="M104 74 Q118 84 112 100"
          className="stroke-brand-navy"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="112" cy="102" r="5" className="fill-brand-navy" />
      </g>
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
      {/* Ojos (parpadean) */}
      <g className="tito-eye">
        <circle cx="44" cy="62" r="8" className="fill-brand-navy" />
        <circle cx="47" cy="59" r="3" className="fill-white" />
      </g>
      <g className="tito-eye">
        <circle cx="76" cy="62" r="8" className="fill-brand-navy" />
        <circle cx="79" cy="59" r="3" className="fill-white" />
      </g>
      {/* Mejillas y sonrisa */}
      <circle className="tito-cheek" cx="32" cy="82" r="7" fill="#ff9f80" />
      <circle className="tito-cheek" cx="88" cy="82" r="7" fill="#ff9f80" />
      <path
        d="M46 82 Q60 98 74 82"
        className="tito-smile stroke-brand-navy"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
