// Animales del desfile entre páginas (los del logo). SVG decorativo; la animación
// vive en globals.css (clases parade-*), y con prefers-reduced-motion no se muestra.
import type { CSSProperties } from "react";

const NAVY = "#1F2A44";
const BLUSH = "#FF9E8A";
const FLAGS = ["#D0352A", "#FFC21F", "#1A5299", "#2F7A1F", "#8447B0", "#F28A1A"];

/** Gira sobre el borde superior del propio elemento (patas y brazos). */
const HIP: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 0" };

function Eye({ x, y, r = 3.2 }: { x: number; y: number; r?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={NAVY} />
      <circle cx={x + r * 0.4} cy={y - r * 0.4} r={r * 0.4} fill="#FFFFFF" />
    </>
  );
}

/** Punto de una curva cuadrática (para colgar banderines de la cuerda). */
function onCurve(t: number, a: number, c: number, b: number) {
  return (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b;
}

/** Elefante caminando, tirando de una cuerda con banderines. */
export function ElephantWithRope() {
  const skin = "#5FAE3A";
  const shade = "#4C9630";
  const rope = { x0: 4, y0: 34, cx: 110, cy: 70, x1: 214, y1: 48 };
  const flags = Array.from({ length: 6 }, (_, i) => {
    const t = (i + 0.6) / 6.4;
    return {
      x: onCurve(t, rope.x0, rope.cx, rope.x1),
      y: onCurve(t, rope.y0, rope.cy, rope.y1),
      color: FLAGS[i % FLAGS.length] ?? NAVY,
    };
  });
  return (
    <svg viewBox="0 0 340 110" className="h-full w-auto overflow-visible">
      {/* Cuerda con banderines, de la trompa hacia atrás */}
      <path
        d={`M${rope.x0} ${rope.y0}Q${rope.cx} ${rope.cy} ${rope.x1} ${rope.y1}Q280 34 322 26`}
        stroke="#8A4B14"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {flags.map((f) => (
        <path
          key={f.x}
          d={`M${f.x - 9} ${f.y}h18l-9 20z`}
          fill={f.color}
          className="parade-flag"
          style={{ transformBox: "fill-box", transformOrigin: "50% 0" }}
        />
      ))}

      <g transform="translate(206 4)">
        {/* Cola */}
        <path
          d="M14 50q-10 6 -8 18"
          stroke={skin}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        {/* Patas (se alternan al caminar) */}
        <g className="parade-step">
          <rect x="26" y="66" width="15" height="30" rx="6" fill={shade} style={HIP} />
          <rect x="84" y="66" width="15" height="30" rx="6" fill={shade} style={HIP} />
        </g>
        <g className="parade-step parade-step--alt">
          <rect x="44" y="66" width="15" height="30" rx="6" fill={skin} style={HIP} />
          <rect x="68" y="66" width="15" height="30" rx="6" fill={skin} style={HIP} />
        </g>
        <ellipse cx="60" cy="56" rx="44" ry="28" fill={skin} />
        {/* Cabeza, oreja y trompa enroscada que sujeta la cuerda */}
        <circle cx="100" cy="40" r="23" fill={skin} />
        <ellipse cx="90" cy="42" rx="12" ry="17" fill={shade} />
        <ellipse cx="91" cy="43" rx="7" ry="11" fill="#F5B7A8" />
        <path
          d="M118 48q12 -2 10 -16q-2 -9 -10 -6"
          stroke={skin}
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
        />
        <Eye x={108} y={34} />
        <circle cx="112" cy="46" r="4" fill={BLUSH} opacity="0.7" />
        <path d="M104 52q4 3 8 0" stroke={NAVY} strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Leoncito saltando (corre hacia la derecha). */
export function JumpingLion() {
  const fur = "#FFC21F";
  const mane = "#E8891B";
  const tufts = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { x: 88 + Math.cos(a) * 21, y: 38 + Math.sin(a) * 21 };
  });
  return (
    <svg viewBox="0 0 130 100" className="h-full w-auto overflow-visible">
      <path
        d="M22 54q-18 -4 -14 -22"
        stroke={fur}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="9" cy="30" r="6" fill={mane} />
      {/* Patas estiradas en el salto */}
      <rect x="20" y="62" width="13" height="26" rx="6" fill={fur} transform="rotate(35 26 62)" />
      <rect x="74" y="62" width="13" height="26" rx="6" fill={fur} transform="rotate(-35 80 62)" />
      <ellipse cx="52" cy="58" rx="34" ry="20" fill={fur} />
      <ellipse cx="52" cy="64" rx="18" ry="10" fill="#FFE08A" />
      {/* Cabeza con melena */}
      {tufts.map((t) => (
        <circle key={`${t.x}-${t.y}`} cx={t.x} cy={t.y} r="9" fill={mane} />
      ))}
      <circle cx="88" cy="38" r="22" fill={mane} />
      <circle cx="76" cy="22" r="6" fill={fur} />
      <circle cx="100" cy="22" r="6" fill={fur} />
      <circle cx="88" cy="40" r="17" fill={fur} />
      <ellipse cx="84" cy="48" rx="6" ry="4.5" fill="#FFF1C4" />
      <ellipse cx="92" cy="48" rx="6" ry="4.5" fill="#FFF1C4" />
      <path d="M85 42h6l-3 4z" fill="#8A4B14" />
      <Eye x={82} y={35} r={2.8} />
      <Eye x={95} y={35} r={2.8} />
      <circle cx="77" cy="44" r="3" fill={BLUSH} opacity="0.7" />
      <circle cx="99" cy="44" r="3" fill={BLUSH} opacity="0.7" />
      <path d="M84 53q4 4 8 0" stroke={NAVY} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Monito colgado de una liana. El giro es sobre el punto de amarre (arriba). */
export function SwingingMonkey() {
  const fur = "#2E78C8";
  const face = "#F4C29A";
  return (
    <svg viewBox="0 0 120 230" className="h-full w-auto overflow-visible">
      <path
        d="M60 0C66 40 54 80 60 130"
        stroke="#2F7A1F"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      {[30, 62, 96].map((y, i) => (
        <ellipse
          key={y}
          cx={i % 2 ? 50 : 70}
          cy={y}
          rx="9"
          ry="4.5"
          fill="#5FAE3A"
          transform={`rotate(${i % 2 ? -30 : 30} ${i % 2 ? 50 : 70} ${y})`}
        />
      ))}
      {/* Brazo que se agarra de la liana */}
      <path d="M62 132L70 162" stroke={fur} strokeWidth="9" strokeLinecap="round" />
      <circle cx="61" cy="130" r="6" fill={face} />
      {/* Cola enroscada */}
      <path
        d="M56 206c-26 6 -34 -18 -18 -22"
        stroke={fur}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="62" cy="194" rx="17" ry="20" fill={fur} />
      <ellipse cx="62" cy="198" rx="10" ry="12" fill={face} />
      {/* Piernas que patalean */}
      <g className="parade-kick">
        <path d="M54 210l-6 16" stroke={fur} strokeWidth="7" strokeLinecap="round" />
        <path d="M70 210l6 16" stroke={fur} strokeWidth="7" strokeLinecap="round" />
      </g>
      {/* Brazo libre que saluda */}
      <path
        d="M76 184l16 -14"
        stroke={fur}
        strokeWidth="7"
        strokeLinecap="round"
        className="parade-wave"
        style={{ transformBox: "fill-box", transformOrigin: "0 100%" }}
      />
      {/* Cabeza */}
      <circle cx="42" cy="166" r="8" fill={fur} />
      <circle cx="82" cy="166" r="8" fill={fur} />
      <circle cx="42" cy="166" r="4.5" fill={face} />
      <circle cx="82" cy="166" r="4.5" fill={face} />
      <circle cx="62" cy="164" r="19" fill={fur} />
      <circle cx="56" cy="161" r="7" fill={face} />
      <circle cx="68" cy="161" r="7" fill={face} />
      <ellipse cx="62" cy="171" rx="12" ry="9" fill={face} />
      <Eye x={56} y={161} r={2.4} />
      <Eye x={68} y={161} r={2.4} />
      <path
        d="M57 175q5 4 10 0"
        stroke={NAVY}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Jirafa que se asoma desde abajo y saluda con la cabeza. */
export function PeekingGiraffe() {
  const skin = "#FFC94D";
  const spot = "#C9781E";
  return (
    <svg viewBox="0 0 110 200" className="h-full w-auto overflow-visible">
      <ellipse cx="55" cy="196" rx="40" ry="26" fill={skin} />
      <g className="parade-nod" style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
        <rect x="42" y="60" width="24" height="132" rx="11" fill={skin} />
        {[78, 104, 130, 156].map((y, i) => (
          <ellipse key={y} cx={i % 2 ? 58 : 50} cy={y} rx="6" ry="8" fill={spot} />
        ))}
        {/* Cabeza */}
        <rect x="44" y="6" width="5" height="16" rx="2.5" fill={spot} />
        <rect x="61" y="6" width="5" height="16" rx="2.5" fill={spot} />
        <circle cx="46.5" cy="6" r="4.5" fill={spot} />
        <circle cx="63.5" cy="6" r="4.5" fill={spot} />
        <ellipse cx="32" cy="34" rx="11" ry="6" fill={skin} transform="rotate(-25 32 34)" />
        <ellipse cx="78" cy="34" rx="11" ry="6" fill={skin} transform="rotate(25 78 34)" />
        <ellipse cx="55" cy="40" rx="24" ry="26" fill={skin} />
        <ellipse cx="55" cy="56" rx="17" ry="12" fill="#F2B23A" />
        <circle cx="49" cy="55" r="2" fill="#8A4B14" />
        <circle cx="61" cy="55" r="2" fill="#8A4B14" />
        <Eye x={46} y={36} r={3.4} />
        <Eye x={64} y={36} r={3.4} />
        <circle cx="38" cy="46" r="4" fill={BLUSH} opacity="0.7" />
        <circle cx="72" cy="46" r="4" fill={BLUSH} opacity="0.7" />
        <path d="M49 62q6 5 12 0" stroke={NAVY} strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
