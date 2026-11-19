import Image from "next/image";

import { LogoSlider, type LogoItem } from "@/shared/ui/logo-slider";

import angol from "../../assets/clientes/angol.webp";
import chilecompra from "../../assets/clientes/chilecompra.webp";
import curarrehue from "../../assets/clientes/curarrehue.webp";
import loncoche from "../../assets/clientes/loncoche.webp";
import nuevaImperial from "../../assets/clientes/nueva-imperial.webp";
import perquenco from "../../assets/clientes/perquenco.webp";
import proveedoresDelEstado from "../../assets/clientes/proveedores-del-estado.webp";
import temucoMunicipioCiudadano from "../../assets/clientes/temuco-municipio-ciudadano.webp";
import temuco from "../../assets/clientes/temuco.webp";
import traiguen from "../../assets/clientes/traiguen.webp";
import ufro from "../../assets/clientes/ufro.webp";
import webpayPlus from "../../assets/clientes/webpay-plus.webp";

/** Instituciones que han comprado a Total Kids (logos tomados de totalmuebles.cl). */
const CLIENTS: readonly LogoItem[] = [
  { src: temucoMunicipioCiudadano, alt: "Temuco, Municipio Ciudadano" },
  { src: nuevaImperial, alt: "Municipalidad de Nueva Imperial" },
  { src: temuco, alt: "Municipalidad de Temuco" },
  { src: curarrehue, alt: "Municipalidad de Curarrehue" },
  { src: traiguen, alt: "Municipalidad de Traiguén" },
  { src: loncoche, alt: "Municipalidad de Loncoche" },
  { src: angol, alt: "Ilustre Municipalidad de Angol" },
  { src: perquenco, alt: "Municipalidad de Perquenco" },
  { src: ufro, alt: "Universidad de La Frontera" },
];

const BADGES: readonly LogoItem[] = [
  { src: proveedoresDelEstado, alt: "Somos proveedores del Estado, Dirección ChileCompra" },
  { src: chilecompra, alt: "Dirección ChileCompra" },
  {
    src: webpayPlus,
    alt: "Pago con Webpay Plus de Transbank: Visa, Mastercard, Magna, American Express, Diners Club y Redcompra",
  },
];

/** Nuestros clientes: carrusel de instituciones y sellos de compra pública y pago. */
export function Clients() {
  return (
    <section aria-labelledby="clientes" className="mx-auto max-w-7xl px-4 pt-12 pb-6 sm:px-6">
      <div className="flex flex-col gap-8 rounded-[28px] bg-surface px-6 py-8 shadow-[0_2px_0_var(--color-border)] sm:rounded-[40px] sm:px-12 sm:py-10">
        <h2
          id="clientes"
          className="text-center text-[clamp(1.875rem,4vw,2.5rem)] leading-[1.08] font-extrabold"
        >
          Nuestros clientes
        </h2>
        <LogoSlider label="Instituciones que confían en Total Kids" logos={CLIENTS} />
        <ul
          aria-label="Compras públicas y medios de pago"
          className="grid grid-cols-1 items-center justify-items-center gap-8 border-t-2 border-border pt-8 sm:grid-cols-3"
        >
          {BADGES.map((badge) => (
            <li key={badge.alt}>
              <Image
                src={badge.src}
                alt={badge.alt}
                sizes="260px"
                className="h-auto max-h-20 w-auto max-w-[260px]"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
