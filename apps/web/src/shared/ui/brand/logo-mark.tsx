/** Isotipo "en bloques": cubos T (azul), K (rojo) y el cubo amarillo con check. Decorativo. */
export function LogoMark({ className = "size-14" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 56 56" className={className}>
      <rect x="2" y="26" width="26" height="26" rx="6" className="fill-brand-blue" />
      <rect x="28" y="26" width="26" height="26" rx="6" className="fill-brand-red" />
      <rect x="15" y="2" width="26" height="26" rx="6" className="fill-brand-yellow" />
      <text
        x="15"
        y="46"
        textAnchor="middle"
        className="fill-white font-heading text-[18px] font-extrabold"
      >
        T
      </text>
      <text
        x="41"
        y="46"
        textAnchor="middle"
        className="fill-white font-heading text-[18px] font-extrabold"
      >
        K
      </text>
      <path
        d="M22 15l4 4 8-8"
        className="stroke-brand-navy"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
