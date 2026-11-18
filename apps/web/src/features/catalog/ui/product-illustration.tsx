// Ilustraciones provisionales de productos, portadas de la maqueta aprobada.
// Se reemplazan por las fotos reales del catálogo (CL-01) cuando estén disponibles.
import type { ReactNode } from "react";

import type { ProductIllustrationKey } from "../domain/product";

/** Fondo de cada ilustración (token de color). */
export const ILLUSTRATION_TINT: Record<ProductIllustrationKey, string> = {
  "mesa-sillas": "bg-cream",
  librero: "bg-soft-green",
  "cama-casita": "bg-soft-purple",
  baul: "bg-soft-red",
  escritorio: "bg-soft-blue",
  organizador: "bg-cream",
  atril: "bg-soft-green",
  torre: "bg-soft-purple",
};

const ART: Record<ProductIllustrationKey, ReactNode> = {
  "mesa-sillas": (
    <>
      <ellipse cx="120" cy="156" rx="104" ry="7" fill="#1F2A44" opacity=".08" />
      <rect x="60" y="82" width="120" height="14" rx="6" fill="#FFC21F" />
      <rect x="70" y="96" width="10" height="56" rx="3" fill="#D9A21E" />
      <rect x="160" y="96" width="10" height="56" rx="3" fill="#D9A21E" />
      <rect x="16" y="112" width="42" height="10" rx="4" fill="#D0352A" />
      <rect x="16" y="72" width="10" height="50" rx="4" fill="#D0352A" />
      <rect x="19" y="122" width="6" height="30" rx="2" fill="#98271F" />
      <rect x="49" y="122" width="6" height="30" rx="2" fill="#98271F" />
      <rect x="182" y="112" width="42" height="10" rx="4" fill="#1A5299" />
      <rect x="214" y="72" width="10" height="50" rx="4" fill="#1A5299" />
      <rect x="185" y="122" width="6" height="30" rx="2" fill="#103B70" />
      <rect x="215" y="122" width="6" height="30" rx="2" fill="#103B70" />
      <rect x="94" y="62" width="20" height="20" rx="4" fill="#1A5299" />
      <text
        x="104"
        y="78"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="15"
        fill="#FFF"
      >
        A
      </text>
      <rect x="118" y="62" width="20" height="20" rx="4" fill="#2F7A1F" />
      <text
        x="128"
        y="78"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="15"
        fill="#FFF"
      >
        B
      </text>
      <rect x="106" y="42" width="20" height="20" rx="4" fill="#8447B0" />
      <text
        x="116"
        y="58"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="15"
        fill="#FFF"
      >
        C
      </text>
    </>
  ),
  librero: (
    <>
      <ellipse cx="120" cy="158" rx="80" ry="6" fill="#1F2A44" opacity=".08" />
      <rect x="60" y="28" width="11" height="126" rx="4" fill="#C98B4E" />
      <rect x="169" y="28" width="11" height="126" rx="4" fill="#C98B4E" />
      <rect x="71" y="70" width="98" height="7" fill="#E8B77A" />
      <rect x="71" y="108" width="98" height="7" fill="#E8B77A" />
      <rect x="71" y="146" width="98" height="7" fill="#E8B77A" />
      <rect x="77" y="40" width="20" height="30" rx="3" fill="#1A5299" />
      <rect x="100" y="36" width="20" height="34" rx="3" fill="#D0352A" />
      <rect x="123" y="42" width="20" height="28" rx="3" fill="#FFC21F" />
      <rect x="146" y="38" width="18" height="32" rx="3" fill="#8447B0" />
      <rect x="77" y="80" width="22" height="28" rx="3" fill="#2F7A1F" />
      <rect x="102" y="76" width="22" height="32" rx="3" fill="#FFC21F" />
      <circle cx="111" cy="90" r="5" fill="#FFF" />
      <rect x="127" y="80" width="18" height="28" rx="3" fill="#1A5299" />
      <rect x="148" y="84" width="16" height="24" rx="3" fill="#D0352A" />
      <rect x="77" y="118" width="24" height="28" rx="3" fill="#8447B0" />
      <rect x="104" y="114" width="20" height="32" rx="3" fill="#D0352A" />
      <rect x="127" y="120" width="18" height="26" rx="3" fill="#2F7A1F" />
      <rect x="148" y="116" width="16" height="30" rx="3" fill="#FFC21F" />
    </>
  ),
  "cama-casita": (
    <>
      <ellipse cx="120" cy="158" rx="96" ry="6" fill="#1F2A44" opacity=".08" />
      <path
        d="M50 74 L120 22 L190 74"
        stroke="#C98B4E"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M50 74 V152 M190 74 V152" stroke="#C98B4E" strokeWidth="10" strokeLinecap="round" />
      <path d="M120 22 V6" stroke="#C98B4E" strokeWidth="4" strokeLinecap="round" />
      <path d="M120 6 l20 6 l-20 6z" fill="#D0352A" />
      <rect x="56" y="118" width="128" height="20" rx="8" fill="#FFFFFF" />
      <rect
        x="62"
        y="104"
        width="40"
        height="18"
        rx="8"
        fill="#FFFFFF"
        stroke="#C9D6EE"
        strokeWidth="2"
      />
      <rect x="96" y="112" width="88" height="26" rx="8" fill="#AA7FD0" />
      <circle cx="120" cy="124" r="3" fill="#FFC21F" />
      <circle cx="140" cy="128" r="3" fill="#FFC21F" />
      <circle cx="160" cy="122" r="3" fill="#FFC21F" />
      <rect x="45" y="136" width="150" height="14" rx="5" fill="#E8B77A" />
      <path d="M98 64l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#FFC21F" />
    </>
  ),
  baul: (
    <>
      <ellipse cx="120" cy="158" rx="84" ry="6" fill="#1F2A44" opacity=".08" />
      <rect x="56" y="84" width="128" height="70" rx="12" fill="#2F7A1F" />
      <rect x="48" y="70" width="144" height="20" rx="9" fill="#255F18" />
      <text
        x="120"
        y="134"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="34"
        fill="#FFFFFF"
      >
        ABC
      </text>
      <circle cx="88" cy="54" r="16" fill="#D0352A" />
      <path d="M74 50 Q88 44 102 50" stroke="#FFFFFF" strokeWidth="3" fill="none" />
      <rect
        x="128"
        y="36"
        width="30"
        height="30"
        rx="6"
        fill="#FFC21F"
        transform="rotate(12 143 51)"
      />
      <text
        x="143"
        y="59"
        textAnchor="middle"
        className="font-heading"
        fontWeight="800"
        fontSize="20"
        fill="#1F2A44"
        transform="rotate(12 143 51)"
      >
        7
      </text>
    </>
  ),
  escritorio: (
    <>
      <ellipse cx="120" cy="158" rx="104" ry="6" fill="#1F2A44" opacity=".08" />
      <rect x="34" y="80" width="136" height="12" rx="5" fill="#1A5299" />
      <rect x="40" y="92" width="9" height="60" rx="3" fill="#103B70" />
      <rect x="126" y="92" width="44" height="60" rx="5" fill="#103B70" />
      <rect x="132" y="100" width="32" height="20" rx="3" fill="#1A5299" />
      <rect x="132" y="126" width="32" height="20" rx="3" fill="#1A5299" />
      <circle cx="148" cy="110" r="3" fill="#FFC21F" />
      <circle cx="148" cy="136" r="3" fill="#FFC21F" />
      <rect x="52" y="72" width="26" height="8" rx="3" fill="#FFC21F" />
      <path d="M65 72 L80 46" stroke="#FFC21F" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 40 L100 48 L86 60z" fill="#FFC21F" />
      <rect x="96" y="70" width="24" height="10" rx="2" fill="#D0352A" />
      <rect x="98" y="64" width="20" height="6" rx="2" fill="#2F7A1F" />
      <rect x="180" y="112" width="42" height="10" rx="4" fill="#D0352A" />
      <rect x="212" y="74" width="10" height="48" rx="4" fill="#D0352A" />
      <rect x="183" y="122" width="6" height="30" rx="2" fill="#98271F" />
      <rect x="213" y="122" width="6" height="30" rx="2" fill="#98271F" />
    </>
  ),
  organizador: (
    <>
      <ellipse cx="120" cy="158" rx="84" ry="6" fill="#1F2A44" opacity=".08" />
      <rect x="50" y="34" width="140" height="118" rx="10" fill="#E8B77A" />
      <rect x="58" y="42" width="40" height="48" rx="6" fill="#D0352A" />
      <rect x="100" y="42" width="40" height="48" rx="6" fill="#1A5299" />
      <rect x="142" y="42" width="40" height="48" rx="6" fill="#2F7A1F" />
      <rect x="58" y="96" width="40" height="48" rx="6" fill="#FFC21F" />
      <rect x="100" y="96" width="40" height="48" rx="6" fill="#8447B0" />
      <rect x="142" y="96" width="40" height="48" rx="6" fill="#D0352A" />
      <rect x="70" y="52" width="16" height="6" rx="3" fill="#FFFFFF" opacity=".6" />
      <rect x="112" y="52" width="16" height="6" rx="3" fill="#FFFFFF" opacity=".6" />
      <rect x="154" y="52" width="16" height="6" rx="3" fill="#FFFFFF" opacity=".6" />
      <rect x="70" y="106" width="16" height="6" rx="3" fill="#FFFFFF" opacity=".6" />
      <rect x="112" y="106" width="16" height="6" rx="3" fill="#FFFFFF" opacity=".6" />
      <rect x="154" y="106" width="16" height="6" rx="3" fill="#FFFFFF" opacity=".6" />
    </>
  ),
  atril: (
    <>
      <ellipse cx="120" cy="158" rx="70" ry="6" fill="#1F2A44" opacity=".08" />
      <path
        d="M84 154 L112 24 M156 154 L128 24"
        stroke="#C98B4E"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <rect
        x="68"
        y="34"
        width="104"
        height="82"
        rx="8"
        fill="#1F4A17"
        stroke="#E8B77A"
        strokeWidth="6"
      />
      <text
        x="98"
        y="88"
        textAnchor="middle"
        className="font-heading"
        fontWeight="700"
        fontSize="26"
        fill="#FFFFFF"
      >
        1 2 3
      </text>
      <circle cx="146" cy="56" r="9" fill="none" stroke="#FFC21F" strokeWidth="3" />
      <path
        d="M84 100 q10 -10 20 0 t20 0"
        stroke="#FFB3C0"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="66" y="118" width="108" height="8" rx="3" fill="#E8B77A" />
      <rect x="80" y="112" width="12" height="6" rx="2" fill="#FFFFFF" />
      <rect x="96" y="112" width="12" height="6" rx="2" fill="#FFC21F" />
    </>
  ),
  torre: (
    <>
      <ellipse cx="120" cy="158" rx="70" ry="6" fill="#1F2A44" opacity=".08" />
      <rect x="70" y="24" width="12" height="130" rx="4" fill="#C98B4E" />
      <rect x="158" y="24" width="12" height="130" rx="4" fill="#C98B4E" />
      <rect x="70" y="24" width="100" height="9" rx="4" fill="#E8B77A" />
      <rect x="70" y="54" width="100" height="7" rx="3" fill="#E8B77A" />
      <rect x="66" y="92" width="108" height="12" rx="4" fill="#8447B0" />
      <rect x="66" y="126" width="108" height="12" rx="4" fill="#FFC21F" />
      <path d="M82 61 V92 M158 61 V92" stroke="#E8B77A" strokeWidth="4" />
    </>
  ),
};

interface ProductIllustrationProps {
  kind: ProductIllustrationKey;
  /** Descripción de la imagen para lectores de pantalla. */
  label: string;
  className?: string;
}

export function ProductIllustration({ kind, label, className = "" }: ProductIllustrationProps) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 240 170"
      className={`block h-auto w-full ${className}`}
    >
      {ART[kind]}
    </svg>
  );
}
