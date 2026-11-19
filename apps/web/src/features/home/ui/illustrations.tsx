// Ilustraciones de la portada, portadas de la maqueta aprobada (SVG en línea).
interface IllustrationProps {
  className?: string;
  /** Si se indica, la ilustración se anuncia; si no, es decorativa. */
  label?: string;
}

function a11y(label?: string) {
  return label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
}

/** Sala de clases con mesa hexagonal y sillas. */
export function Classroom({ className, label }: IllustrationProps) {
  return (
    <svg viewBox="0 0 320 220" className={className} {...a11y(label)}>
      <rect x="0" y="0" width="320" height="220" rx="28" fill="#FFF3CC" />
      <rect
        x="40"
        y="30"
        width="120"
        height="70"
        rx="8"
        fill="#1F4A17"
        stroke="#E8B77A"
        strokeWidth="6"
      />
      <text
        x="100"
        y="74"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="26"
        fill="#FFFFFF"
      >
        A B C
      </text>
      <path
        d="M200 40l40 0M200 56l60 0M200 72l50 0"
        stroke="#E5D3A0"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path d="M110 150 l30 -20 h60 l30 20 l-30 20 h-60z" fill="#1A5299" />
      <rect x="132" y="170" width="8" height="30" rx="3" fill="#103B70" />
      <rect x="200" y="170" width="8" height="30" rx="3" fill="#103B70" />
      <rect x="60" y="150" width="34" height="9" rx="4" fill="#D0352A" />
      <rect x="60" y="120" width="9" height="40" rx="4" fill="#D0352A" />
      <rect x="62" y="159" width="6" height="28" fill="#98271F" />
      <rect x="86" y="159" width="6" height="28" fill="#98271F" />
      <rect x="246" y="150" width="34" height="9" rx="4" fill="#2F7A1F" />
      <rect x="271" y="120" width="9" height="40" rx="4" fill="#2F7A1F" />
      <rect x="248" y="159" width="6" height="28" fill="#255F18" />
      <rect x="272" y="159" width="6" height="28" fill="#255F18" />
      <rect x="155" y="112" width="18" height="18" rx="4" fill="#FFC21F" />
      <rect x="176" y="116" width="14" height="14" rx="3" fill="#8447B0" />
    </svg>
  );
}

/** Cama casita. */
export function BlogMontessori({ className, label }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 120" className={className} {...a11y(label)}>
      <path
        d="M50 60 L100 22 L150 60"
        stroke="#C98B4E"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M50 60V106M150 60V106" stroke="#C98B4E" strokeWidth="8" strokeLinecap="round" />
      <rect x="56" y="86" width="88" height="16" rx="6" fill="#AA7FD0" />
      <rect x="44" y="100" width="112" height="10" rx="4" fill="#E8B77A" />
    </svg>
  );
}

/** Mesa, silla y regla de altura. */
export function BlogHeight({ className, label }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 120" className={className} {...a11y(label)}>
      <rect x="60" y="56" width="90" height="10" rx="4" fill="#1A5299" />
      <rect x="68" y="66" width="8" height="44" rx="3" fill="#103B70" />
      <rect x="134" y="66" width="8" height="44" rx="3" fill="#103B70" />
      <path d="M170 20v90" stroke="#1F2A44" strokeWidth="3" />
      <path d="M164 20h12M164 50h8M164 80h8M164 110h12" stroke="#1F2A44" strokeWidth="3" />
      <rect x="24" y="80" width="30" height="8" rx="3" fill="#D0352A" />
      <rect x="24" y="56" width="8" height="32" rx="3" fill="#D0352A" />
    </svg>
  );
}

/** Organizador de cubos. */
export function BlogOrder({ className, label }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 120" className={className} {...a11y(label)}>
      <rect x="50" y="16" width="100" height="96" rx="8" fill="#E8B77A" />
      <rect x="58" y="24" width="40" height="40" rx="5" fill="#D0352A" />
      <rect x="102" y="24" width="40" height="40" rx="5" fill="#FFC21F" />
      <rect x="58" y="66" width="40" height="40" rx="5" fill="#1A5299" />
      <rect x="102" y="66" width="40" height="40" rx="5" fill="#2F7A1F" />
    </svg>
  );
}

/** Bloques decorativos de fondo. */
export function PhilosophyBlocks({ className, label }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 200" className={className} {...a11y(label)}>
      <rect x="20" y="20" width="70" height="70" rx="14" fill="#FFFFFF" />
      <rect x="100" y="60" width="80" height="80" rx="16" fill="#FFFFFF" />
      <rect x="40" y="110" width="60" height="60" rx="12" fill="#FFFFFF" />
    </svg>
  );
}
