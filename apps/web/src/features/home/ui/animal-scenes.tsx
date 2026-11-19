// Escenas del carrusel de portada: cada animal del logo armando un mueble.
// SVG en línea con animaciones CSS (tokens --animate-* de globals.css), siempre
// bajo motion-safe: con prefers-reduced-motion quedan como ilustración fija.
import type { CSSProperties, ReactNode } from "react";

interface SceneProps {
  className?: string;
  /** Descripción de la escena para lectores de pantalla. */
  label: string;
}

const NAVY = "#1F2A44";
const WOOD = "#C98B4E";
const WOOD_LIGHT = "#E8B77A";
const BLUSH = "#FF9E8A";

/** Punto de giro en coordenadas del viewBox (560 × 440). */
function pivot(x: number, y: number): CSSProperties {
  return { transformBox: "view-box", transformOrigin: `${x}px ${y}px` };
}
/** Giro sobre el centro del propio elemento. */
const SELF: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

function Scene({
  label,
  className,
  halo,
  rug,
  children,
}: SceneProps & { halo: string; rug: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 560 440" role="img" aria-label={label} className={className}>
      <circle cx="290" cy="215" r="195" fill={halo} />
      <ellipse cx="280" cy="398" rx="250" ry="28" fill={rug} />
      {children}
    </svg>
  );
}

function Sparkle({
  x,
  y,
  size = 10,
  color,
  wait = 0,
}: {
  x: number;
  y: number;
  size?: number;
  color: string;
  wait?: number;
}) {
  const s = size;
  return (
    <path
      d={`M${x} ${y - s}Q${x + s * 0.15} ${y - s * 0.15} ${x + s} ${y}Q${x + s * 0.15} ${y + s * 0.15} ${x} ${y + s}Q${x - s * 0.15} ${y + s * 0.15} ${x - s} ${y}Q${x - s * 0.15} ${y - s * 0.15} ${x} ${y - s}Z`}
      fill={color}
      className="motion-safe:animate-twinkle"
      style={{ ...SELF, ...delay(wait) }}
    />
  );
}

function Eye({ x, y, r = 6 }: { x: number; y: number; r?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={NAVY} />
      <circle cx={x + r * 0.35} cy={y - r * 0.35} r={r * 0.35} fill="#FFFFFF" />
    </>
  );
}

/** Jirafa pintando un librero frontal con la brocha en la boca. */
export function GiraffeScene(props: SceneProps) {
  const fur = "#F29A2E";
  const spot = "#C9621A";
  const hoof = "#8A4B14";
  return (
    <Scene {...props} halo="#FFF6D6" rug="#FFC7B0">
      {/* Librero frontal */}
      <rect x="60" y="150" width="14" height="242" rx="5" fill={WOOD} />
      <rect x="216" y="150" width="14" height="242" rx="5" fill={WOOD} />
      <rect x="74" y="232" width="142" height="10" rx="3" fill={WOOD_LIGHT} />
      <rect x="74" y="312" width="142" height="10" rx="3" fill={WOOD_LIGHT} />
      <rect x="74" y="382" width="142" height="10" rx="3" fill={WOOD_LIGHT} />
      <rect
        x="84"
        y="176"
        width="34"
        height="54"
        rx="4"
        fill="#D0352A"
        transform="rotate(-6 101 203)"
      />
      <rect x="126" y="172" width="36" height="58" rx="4" fill="#FFC21F" />
      <circle cx="144" cy="196" r="9" fill="#FFFFFF" opacity="0.8" />
      <rect
        x="170"
        y="180"
        width="36"
        height="50"
        rx="4"
        fill="#2F7A1F"
        transform="rotate(5 188 205)"
      />
      <rect x="86" y="256" width="38" height="54" rx="4" fill="#1A5299" />
      <path d="M105 272l4 8 9 1-6 6 1 9-8-4-8 4 1-9-6-6 9-1z" fill="#FFC21F" />
      <rect
        x="132"
        y="252"
        width="34"
        height="58"
        rx="4"
        fill="#8447B0"
        transform="rotate(-4 149 281)"
      />
      <rect x="174" y="260" width="34" height="50" rx="4" fill="#FF8A5C" />
      <circle cx="108" cy="362" r="18" fill="#D0352A" />
      <path d="M90 362h36" stroke="#FFFFFF" strokeWidth="4" />
      <rect x="148" y="342" width="40" height="38" rx="6" fill="#FFC21F" />
      {/* Travesaño recién pintado y gotas */}
      <rect x="54" y="140" width="182" height="18" rx="7" fill="#1A5299" />
      <rect x="112" y="152" width="8" height="16" rx="4" fill="#1A5299" />
      <rect x="176" y="152" width="8" height="12" rx="4" fill="#1A5299" />
      <circle cx="116" cy="172" r="4" fill="#1A5299" className="motion-safe:animate-drip" />
      <circle
        cx="180"
        cy="168"
        r="3.5"
        fill="#1A5299"
        className="motion-safe:animate-drip"
        style={delay(900)}
      />
      {/* Tarro de pintura */}
      <rect x="250" y="346" width="44" height="46" rx="7" fill="#DCE3EE" />
      <ellipse cx="272" cy="348" rx="22" ry="7" fill="#1A5299" />
      <path d="M262 352v18" stroke="#1A5299" strokeWidth="6" strokeLinecap="round" />
      <path d="M252 350q20 -40 40 0" stroke="#8A93A6" strokeWidth="3" fill="none" />

      {/* Jirafa: cuerpo y patas */}
      <path
        d="M490 292q20 14 12 42"
        stroke={fur}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="501" cy="338" r="7" fill={hoof} />
      {[368, 398, 440, 468].map((x) => (
        <g key={x}>
          <rect x={x} y="318" width="18" height="74" rx="8" fill={fur} />
          <rect x={x} y="382" width="18" height="12" rx="4" fill={hoof} />
        </g>
      ))}
      <ellipse cx="420" cy="300" rx="74" ry="44" fill={fur} />
      <ellipse cx="398" cy="290" rx="13" ry="9" fill={spot} />
      <ellipse cx="440" cy="310" rx="10" ry="8" fill={spot} />
      <ellipse cx="462" cy="284" rx="12" ry="8" fill={spot} />
      <ellipse cx="416" cy="320" rx="7" ry="5" fill={spot} />

      {/* Cuello, cabeza y brocha: se mecen para pintar */}
      <g className="motion-safe:animate-sway" style={pivot(395, 292)}>
        <path
          d="M378 300L408 296L352 150L322 160Z"
          fill={fur}
          stroke={fur}
          strokeWidth="10"
          strokeLinejoin="round"
        />
        <path
          d="M410 290L356 150"
          stroke={spot}
          strokeWidth="7"
          strokeDasharray="10 9"
          strokeLinecap="round"
        />
        <ellipse cx="372" cy="252" rx="9" ry="7" fill={spot} />
        <ellipse cx="354" cy="204" rx="8" ry="6" fill={spot} />
        <ellipse cx="388" cy="276" rx="6" ry="5" fill={spot} />
        <path
          d="M322 120L316 96M338 122L342 98"
          stroke={spot}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx="316" cy="94" r="7" fill={hoof} />
        <circle cx="342" cy="96" r="7" fill={hoof} />
        <ellipse cx="352" cy="128" rx="15" ry="7" fill={fur} transform="rotate(25 352 128)" />
        <ellipse cx="320" cy="138" rx="35" ry="26" fill={fur} transform="rotate(-15 320 138)" />
        <ellipse cx="294" cy="152" rx="22" ry="16" fill="#FFC98A" />
        <circle cx="286" cy="147" r="2.5" fill={hoof} />
        <circle cx="297" cy="145" r="2.5" fill={hoof} />
        <Eye x={322} y={130} />
        <circle cx="336" cy="150" r="6" fill={BLUSH} opacity="0.7" />
        <path d="M282 160L248 168" stroke={WOOD} strokeWidth="7" strokeLinecap="round" />
        <rect x="240" y="160" width="12" height="16" rx="2" fill="#B7BFCC" />
        <rect x="222" y="158" width="20" height="20" rx="4" fill="#1A5299" />
      </g>

      <Sparkle x={490} y={120} size={14} color="#FFC21F" />
      <Sparkle x={250} y={110} size={9} color="#D0352A" wait={600} />
    </Scene>
  );
}

/** León clavando el techo de una cama casita. */
export function LionScene(props: SceneProps) {
  const fur = "#FFC21F";
  const mane = "#E8891B";
  const mane_points = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    return { x: 410 + Math.cos(angle) * 56, y: 206 + Math.sin(angle) * 56 };
  });
  return (
    <Scene {...props} halo="#FFF4EE" rug="#FFD3A8">
      {/* Cama casita */}
      <path d="M70 196V384M290 196V384" stroke={WOOD} strokeWidth="14" strokeLinecap="round" />
      <path d="M100 178Q180 202 260 178" stroke={NAVY} strokeWidth="2" fill="none" />
      <path d="M118 184l8 20l12 -16z" fill="#D0352A" />
      <path d="M164 191l6 20l14 -16z" fill="#1A5299" />
      <path d="M210 190l4 20l16 -14z" fill="#2F7A1F" />
      <path
        d="M50 206L180 102L310 206"
        stroke={WOOD}
        strokeWidth="16"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="58" y="334" width="244" height="22" rx="8" fill={WOOD_LIGHT} />
      <rect x="74" y="308" width="212" height="30" rx="12" fill="#AA7FD0" />
      <ellipse cx="112" cy="304" rx="30" ry="12" fill="#FFFFFF" />
      <rect x="150" y="300" width="136" height="38" rx="12" fill="#8447B0" />
      <circle cx="180" cy="318" r="4" fill="#FFFFFF" opacity="0.7" />
      <circle cx="214" cy="326" r="4" fill="#FFFFFF" opacity="0.7" />
      <circle cx="250" cy="316" r="4" fill="#FFFFFF" opacity="0.7" />
      <circle cx="262" cy="166" r="4" fill="#5B6478" />
      {/* Golpe del martillo */}
      <path
        d="M246 146l6 10 11-4-5 10 10 6-12 2 0 12-8-9-9 8 1-12-12-2 10-6-5-10 11 4z"
        fill="#FFC21F"
        stroke="#FFFFFF"
        strokeWidth="2"
        className="opacity-0 motion-safe:animate-hit"
        style={SELF}
      />

      {/* León: cola, cuerpo y piernas */}
      <path
        d="M456 340q42 -6 32 -48"
        stroke={fur}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="488" cy="290" r="11" fill={mane} />
      <rect x="372" y="350" width="28" height="42" rx="12" fill={fur} />
      <rect x="422" y="350" width="28" height="42" rx="12" fill={fur} />
      <rect x="360" y="268" width="100" height="100" rx="44" fill={fur} />
      <ellipse cx="410" cy="326" rx="30" ry="28" fill="#FFE08A" />
      <path d="M452 300l-10 26" stroke={fur} strokeWidth="20" strokeLinecap="round" />

      {/* Cabeza con melena */}
      {mane_points.map((p) => (
        <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r="17" fill={mane} />
      ))}
      <circle cx="410" cy="206" r="58" fill={mane} />
      <circle cx="374" cy="168" r="13" fill={fur} />
      <circle cx="446" cy="168" r="13" fill={fur} />
      <circle cx="374" cy="168" r="6" fill="#FFB0A0" />
      <circle cx="446" cy="168" r="6" fill="#FFB0A0" />
      <circle cx="410" cy="208" r="42" fill={fur} />
      <ellipse cx="399" cy="226" rx="15" ry="11" fill="#FFF1C4" />
      <ellipse cx="421" cy="226" rx="15" ry="11" fill="#FFF1C4" />
      <path d="M402 213h16l-8 10z" fill="#8A4B14" />
      <Eye x={394} y={198} />
      <Eye x={426} y={198} />
      <circle cx="382" cy="218" r="6" fill={BLUSH} opacity="0.7" />
      <circle cx="438" cy="218" r="6" fill={BLUSH} opacity="0.7" />
      <path
        d="M400 236q10 8 20 0"
        stroke={NAVY}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Brazo con martillo: golpea el techo */}
      <g className="motion-safe:animate-swing" style={pivot(372, 290)}>
        <path d="M372 290L320 230" stroke={fur} strokeWidth="22" strokeLinecap="round" />
        <path d="M318 228L282 166" stroke="#8A4B14" strokeWidth="7" strokeLinecap="round" />
        <rect
          x="257"
          y="141"
          width="44"
          height="22"
          rx="5"
          fill="#5B6478"
          transform="rotate(-30 279 152)"
        />
        <circle cx="318" cy="228" r="14" fill={fur} />
      </g>

      <Sparkle x={500} y={110} size={13} color="#D0352A" />
      <Sparkle x={330} y={90} size={9} color="#8447B0" wait={700} />
    </Scene>
  );
}

/** Elefante pintando una mesa con la trompa. */
export function ElephantScene(props: SceneProps) {
  const skin = "#5FAE3A";
  const shade = "#4C9630";
  return (
    <Scene {...props} halo="#F6FBEF" rug="#CFE8B8">
      {/* Mesa a medio pintar y silla */}
      <rect x="78" y="300" width="14" height="92" rx="5" fill={WOOD} />
      <rect x="238" y="300" width="14" height="92" rx="5" fill="#98271F" />
      <rect x="60" y="282" width="210" height="20" rx="8" fill={WOOD_LIGHT} />
      <rect x="140" y="282" width="130" height="20" rx="8" fill="#D0352A" />
      <rect x="28" y="330" width="44" height="12" rx="5" fill="#1A5299" />
      <rect x="28" y="270" width="12" height="72" rx="5" fill="#1A5299" />
      <rect x="32" y="342" width="8" height="50" rx="3" fill="#103B70" />
      <rect x="62" y="342" width="8" height="50" rx="3" fill="#103B70" />
      <rect x="124" y="250" width="30" height="32" rx="6" fill="#FFC21F" />
      <circle cx="139" cy="266" r="7" fill="#FFFFFF" opacity="0.8" />
      {/* Tarro de pintura y salpicaduras */}
      <rect x="262" y="350" width="42" height="42" rx="7" fill="#DCE3EE" />
      <ellipse cx="283" cy="352" rx="21" ry="7" fill="#D0352A" />
      <circle
        cx="160"
        cy="260"
        r="5"
        fill="#D0352A"
        className="motion-safe:animate-twinkle"
        style={SELF}
      />
      <circle
        cx="220"
        cy="254"
        r="4"
        fill="#D0352A"
        className="motion-safe:animate-twinkle"
        style={{ ...SELF, ...delay(500) }}
      />

      {/* Elefante: cola, cuerpo y patas */}
      <path
        d="M494 306q18 10 10 32"
        stroke={skin}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="364" y="336" width="32" height="56" rx="12" fill={skin} />
      <rect x="444" y="336" width="32" height="56" rx="12" fill={skin} />
      <ellipse cx="420" cy="318" rx="80" ry="56" fill={skin} />
      {[370, 380, 450, 460].map((x) => (
        <ellipse key={x} cx={x + 2} cy="389" rx="4" ry="3" fill="#FFFFFF" />
      ))}
      {/* Oreja y cabeza */}
      <ellipse cx="440" cy="218" rx="42" ry="52" fill={shade} />
      <ellipse cx="444" cy="220" rx="26" ry="34" fill="#F5B7A8" />
      <circle cx="384" cy="218" r="58" fill={skin} />
      <Eye x={366} y={204} />
      <circle cx="392" cy="234" r="7" fill={BLUSH} opacity="0.7" />
      <path
        d="M352 252q-6 10 -16 12"
        stroke="#FFFFFF"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />

      {/* Trompa con brocha: pinta de lado a lado */}
      <g className="motion-safe:animate-sway" style={pivot(352, 236)}>
        <path
          d="M352 236C322 244 300 256 292 266"
          stroke={skin}
          strokeWidth="26"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M330 236l4 12M314 244l5 11" stroke={shade} strokeWidth="3" strokeLinecap="round" />
        <path d="M290 266L248 272" stroke={WOOD} strokeWidth="7" strokeLinecap="round" />
        <rect x="238" y="264" width="12" height="16" rx="2" fill="#B7BFCC" />
        <rect x="220" y="262" width="20" height="20" rx="4" fill="#D0352A" />
      </g>

      <Sparkle x={500} y={130} size={14} color="#FFC21F" />
      <Sparkle x={90} y={200} size={10} color="#2F7A1F" wait={800} />
    </Scene>
  );
}

/** Oso ordenando cubos en un organizador. */
export function BearScene(props: SceneProps) {
  const fur = "#8447B0";
  const light = "#D9C2EC";
  const bins = [
    { col: 0, row: 0, color: "#D0352A" },
    { col: 1, row: 0, color: "#1A5299" },
    { col: 0, row: 1, color: "#FFC21F" },
    { col: 1, row: 1, color: "#AA7FD0" },
    { col: 2, row: 1, color: "#FF8A5C" },
  ];
  return (
    <Scene {...props} halo="#FBF6FD" rug="#E6D3F3">
      {/* Organizador 3 × 2 */}
      <rect x="60" y="214" width="200" height="178" rx="12" fill={WOOD_LIGHT} />
      {[0, 1, 2].flatMap((col) =>
        [0, 1].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={72 + col * 62}
            y={226 + row * 82}
            width="52"
            height="74"
            rx="6"
            fill={WOOD}
          />
        )),
      )}
      {bins.map((bin) => (
        <g key={`${bin.col}-${bin.row}`}>
          <rect
            x={76 + bin.col * 62}
            y={246 + bin.row * 82}
            width="44"
            height="50"
            rx="6"
            fill={bin.color}
          />
          <rect
            x={90 + bin.col * 62}
            y={256 + bin.row * 82}
            width="16"
            height="6"
            rx="3"
            fill="#FFFFFF"
            opacity="0.7"
          />
        </g>
      ))}
      {/* Caja que cae en el hueco libre */}
      <g className="motion-safe:animate-drop-in" style={SELF}>
        <rect x="200" y="246" width="44" height="50" rx="6" fill="#2F7A1F" />
        <rect x="214" y="256" width="16" height="6" rx="3" fill="#FFFFFF" opacity="0.7" />
      </g>

      {/* Oso: piernas, cuerpo y cabeza */}
      <ellipse cx="380" cy="384" rx="24" ry="12" fill="#6E3896" />
      <ellipse cx="440" cy="384" rx="24" ry="12" fill="#6E3896" />
      <ellipse cx="410" cy="318" rx="64" ry="70" fill={fur} />
      <ellipse cx="410" cy="336" rx="36" ry="40" fill={light} />
      <circle cx="370" cy="156" r="18" fill={fur} />
      <circle cx="450" cy="156" r="18" fill={fur} />
      <circle cx="370" cy="156" r="9" fill={light} />
      <circle cx="450" cy="156" r="9" fill={light} />
      <circle cx="410" cy="196" r="50" fill={fur} />
      <ellipse cx="410" cy="214" rx="22" ry="16" fill={light} />
      <ellipse cx="410" cy="206" rx="8" ry="5" fill={NAVY} />
      <path
        d="M402 220q8 7 16 0"
        stroke={NAVY}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <Eye x={392} y={186} />
      <Eye x={428} y={186} />
      <circle cx="380" cy="208" r="6" fill={BLUSH} opacity="0.7" />
      <circle cx="440" cy="208" r="6" fill={BLUSH} opacity="0.7" />

      {/* Brazos con un cubo: lo levanta para guardarlo */}
      <g className="motion-safe:animate-lift">
        <rect x="382" y="238" width="56" height="48" rx="8" fill="#FFC21F" />
        <text
          x="410"
          y="274"
          textAnchor="middle"
          className="font-heading"
          fontWeight="800"
          fontSize="30"
          fill={NAVY}
        >
          A
        </text>
        <path
          d="M360 296L384 266M460 296L436 266"
          stroke={fur}
          strokeWidth="20"
          strokeLinecap="round"
        />
        <circle cx="384" cy="264" r="11" fill={fur} />
        <circle cx="436" cy="264" r="11" fill={fur} />
      </g>

      <Sparkle x={496} y={120} size={14} color="#FFC21F" />
      <Sparkle x={300} y={200} size={9} color="#8447B0" wait={500} />
    </Scene>
  );
}

/** Mono lijando el respaldo de una silla. */
export function MonkeyScene(props: SceneProps) {
  const fur = "#2E78C8";
  const face = "#F4C29A";
  return (
    <Scene {...props} halo="#F3F8FF" rug="#C9DCF7">
      {/* Silla y mesa hexagonal de sala */}
      <path d="M40 300l24 -16h52l24 16l-24 16h-52z" fill="#FFC21F" />
      <rect x="66" y="316" width="10" height="76" rx="4" fill="#C79000" />
      <rect x="104" y="316" width="10" height="76" rx="4" fill="#C79000" />
      <rect x="196" y="314" width="12" height="78" rx="5" fill="#103B70" />
      <rect x="292" y="314" width="12" height="78" rx="5" fill="#103B70" />
      <rect x="190" y="300" width="120" height="16" rx="6" fill="#1A5299" />
      <rect x="194" y="196" width="36" height="112" rx="10" fill="#2E6CC0" />
      <path d="M204 214v76M220 214v76" stroke="#1A5299" strokeWidth="4" strokeLinecap="round" />
      {/* Aserrín */}
      <circle cx="222" cy="290" r="3" fill={WOOD_LIGHT} className="motion-safe:animate-drip" />
      <circle
        cx="236"
        cy="286"
        r="2.5"
        fill={WOOD_LIGHT}
        className="motion-safe:animate-drip"
        style={delay(700)}
      />
      <circle
        cx="228"
        cy="280"
        r="2"
        fill={WOOD_LIGHT}
        className="motion-safe:animate-drip"
        style={delay(1400)}
      />

      {/* Mono: cola, cuerpo y cabeza */}
      <g
        className="motion-safe:animate-sway"
        style={{ ...pivot(446, 340), animationDuration: "2.6s" }}
      >
        <path
          d="M446 340C504 340 504 266 472 266C456 266 456 288 470 290"
          stroke={fur}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <ellipse cx="380" cy="384" rx="22" ry="11" fill={face} />
      <ellipse cx="424" cy="384" rx="22" ry="11" fill={face} />
      <rect x="370" y="340" width="20" height="40" rx="9" fill={fur} />
      <rect x="414" y="340" width="20" height="40" rx="9" fill={fur} />
      <ellipse cx="402" cy="316" rx="50" ry="54" fill={fur} />
      <ellipse cx="402" cy="326" rx="30" ry="34" fill={face} />
      <path d="M446 300l-6 34" stroke={fur} strokeWidth="16" strokeLinecap="round" />
      <circle cx="352" cy="212" r="20" fill={fur} />
      <circle cx="452" cy="212" r="20" fill={fur} />
      <circle cx="352" cy="212" r="11" fill={face} />
      <circle cx="452" cy="212" r="11" fill={face} />
      <circle cx="402" cy="210" r="48" fill={fur} />
      <circle cx="388" cy="204" r="17" fill={face} />
      <circle cx="416" cy="204" r="17" fill={face} />
      <ellipse cx="402" cy="226" rx="32" ry="24" fill={face} />
      <Eye x={389} y={204} r={5.5} />
      <Eye x={415} y={204} r={5.5} />
      <circle cx="397" cy="220" r="2" fill="#8A4B14" />
      <circle cx="407" cy="220" r="2" fill="#8A4B14" />
      <path
        d="M390 232q12 10 24 0"
        stroke={NAVY}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="376" cy="226" r="5" fill={BLUSH} opacity="0.7" />
      <circle cx="428" cy="226" r="5" fill={BLUSH} opacity="0.7" />

      {/* Brazo con lija: sube y baja por el respaldo */}
      <g
        className="motion-safe:animate-sway"
        style={{ ...pivot(362, 292), animationDuration: "0.8s" }}
      >
        <path d="M362 292L254 250" stroke={fur} strokeWidth="18" strokeLinecap="round" />
        <rect x="228" y="236" width="24" height="28" rx="5" fill={WOOD_LIGHT} />
        <rect x="228" y="236" width="6" height="28" rx="2" fill="#B88A3E" />
        <circle cx="256" cy="250" r="12" fill={face} />
      </g>

      <Sparkle x={500} y={124} size={14} color="#FFC21F" />
      <Sparkle x={140} y={210} size={10} color="#1A5299" wait={600} />
    </Scene>
  );
}
