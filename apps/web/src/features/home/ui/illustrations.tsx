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

/** Sala infantil con librero, mesa con sillas y bloques de letras. */
export function HeroRoom({ className, label }: IllustrationProps) {
  return (
    <svg viewBox="0 0 560 440" className={className} {...a11y(label)}>
      <circle cx="300" cy="220" r="200" fill="#FFF6D6" />
      <path d="M40 50 Q170 95 300 60" stroke="#1F2A44" strokeWidth="2" fill="none" />
      <path d="M70 62 l14 34 l16 -28z" fill="#D0352A" />
      <path d="M125 78 l12 34 l18 -26z" fill="#1A5299" />
      <path d="M180 84 l10 34 l20 -28z" fill="#2F7A1F" />
      <path d="M235 76 l8 34 l22 -26z" fill="#8447B0" />
      <rect
        x="340"
        y="48"
        width="160"
        height="128"
        rx="16"
        fill="#CFE3FF"
        stroke="#FFFFFF"
        strokeWidth="10"
      />
      <path d="M420 48v128M340 112h160" stroke="#FFFFFF" strokeWidth="8" />
      <circle cx="378" cy="84" r="16" fill="#FFC21F" />
      <ellipse cx="460" cy="146" rx="26" ry="10" fill="#FFFFFF" />
      <ellipse cx="444" cy="140" rx="14" ry="10" fill="#FFFFFF" />
      <ellipse cx="290" cy="400" rx="250" ry="30" fill="#FFC7B0" />
      <ellipse cx="290" cy="400" rx="190" ry="20" fill="#FFB094" />
      <rect x="40" y="176" width="14" height="216" rx="5" fill="#C98B4E" />
      <rect x="156" y="176" width="14" height="216" rx="5" fill="#C98B4E" />
      <rect x="54" y="236" width="102" height="9" fill="#E8B77A" />
      <rect x="54" y="306" width="102" height="9" fill="#E8B77A" />
      <rect x="54" y="376" width="102" height="9" fill="#E8B77A" />
      <rect x="60" y="196" width="28" height="40" rx="4" fill="#1A5299" />
      <rect x="92" y="190" width="26" height="46" rx="4" fill="#D0352A" />
      <rect x="122" y="200" width="28" height="36" rx="4" fill="#FFC21F" />
      <rect x="60" y="266" width="26" height="40" rx="4" fill="#2F7A1F" />
      <rect x="90" y="262" width="30" height="44" rx="4" fill="#8447B0" />
      <circle cx="136" cy="292" r="14" fill="#D0352A" />
      <rect x="62" y="338" width="40" height="38" rx="6" fill="#FFC21F" />
      <rect x="108" y="344" width="42" height="32" rx="6" fill="#1A5299" />
      <rect x="210" y="282" width="190" height="20" rx="8" fill="#1A5299" />
      <rect x="226" y="302" width="14" height="92" rx="5" fill="#103B70" />
      <rect x="370" y="302" width="14" height="92" rx="5" fill="#103B70" />
      <rect x="186" y="328" width="50" height="12" rx="5" fill="#D0352A" />
      <rect x="186" y="270" width="12" height="70" rx="5" fill="#D0352A" />
      <rect x="190" y="340" width="8" height="52" rx="3" fill="#98271F" />
      <rect x="226" y="340" width="8" height="52" rx="3" fill="#98271F" />
      <rect x="374" y="328" width="50" height="12" rx="5" fill="#2F7A1F" />
      <rect x="412" y="270" width="12" height="70" rx="5" fill="#2F7A1F" />
      <rect x="376" y="340" width="8" height="52" rx="3" fill="#255F18" />
      <rect x="412" y="340" width="8" height="52" rx="3" fill="#255F18" />
      <rect x="262" y="248" width="34" height="34" rx="6" fill="#FFC21F" />
      <text
        x="279"
        y="273"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="24"
        fill="#1F2A44"
      >
        A
      </text>
      <rect x="300" y="256" width="26" height="26" rx="5" fill="#8447B0" />
      <text
        x="313"
        y="276"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="18"
        fill="#FFFFFF"
      >
        b
      </text>
      <rect x="440" y="318" width="56" height="56" rx="10" fill="#D0352A" />
      <text
        x="468"
        y="360"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="38"
        fill="#FFFFFF"
      >
        A
      </text>
      <rect x="496" y="330" width="44" height="44" rx="9" fill="#1A5299" />
      <text
        x="518"
        y="364"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="30"
        fill="#FFFFFF"
      >
        B
      </text>
      <rect
        x="462"
        y="270"
        width="48"
        height="48"
        rx="9"
        fill="#2F7A1F"
        transform="rotate(-8 486 294)"
      />
      <text
        x="486"
        y="306"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="32"
        fill="#FFFFFF"
        transform="rotate(-8 486 294)"
      >
        C
      </text>
      <path d="M520 220l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill="#FFC21F" />
      <path d="M210 170l4 8 9 1-6 6 1 9-8-4-8 4 1-9-6-6 9-1z" fill="#D0352A" />
    </svg>
  );
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
