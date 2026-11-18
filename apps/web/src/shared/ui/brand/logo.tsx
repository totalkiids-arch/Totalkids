import Image from "next/image";

import logoImage from "./total-kids-logo.png";

/**
 * Logo oficial de Total Kids entregado por el cliente: disco con anillo azul y las
 * letras "TOTAL KIDS" formadas por animales, más el lema "Aprender jugando".
 *
 * El archivo se recortó de la imagen del cliente (docs/maqueta/total kids.png) con
 * fondo transparente. Cuando llegue la versión vectorial (SVG), basta con reemplazar
 * total-kids-logo.png.
 */

const SIZES = {
  /** Panel administrativo. */
  sm: { box: "size-11", px: 44 },
  /** Cabecera de la tienda: más chico en móvil. */
  md: { box: "size-16 sm:size-[88px]", px: 88 },
  /** Pantallas de acceso. */
  lg: { box: "size-32", px: 128 },
  /** Pie de página. */
  footer: { box: "size-24", px: 96 },
} as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  /** Precargar la imagen: solo en el logo visible al cargar la página (cabecera). */
  preload?: boolean;
  className?: string;
}

export function Logo({ size = "md", preload = false, className = "" }: LogoProps) {
  const s = SIZES[size];
  return (
    <Image
      src={logoImage}
      alt="Total Kids, aprender jugando"
      // sizes permite a next/image servir la resolución justa (también en pantallas retina).
      sizes={`${s.px}px`}
      preload={preload}
      className={`shrink-0 ${s.box} ${className}`}
    />
  );
}
