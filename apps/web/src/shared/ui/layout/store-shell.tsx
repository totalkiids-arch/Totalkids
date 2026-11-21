import type { ReactNode } from "react";

import { StoreFooter } from "./store-footer";
import { StoreHeader } from "./store-header";

/** Estructura común de la tienda y la consulta de pedidos: cabecera, contenido y pie. */
export function StoreShell({
  children,
  cartLink,
  seasonalBanner,
  seasonalDecor,
  theme = "clasica",
}: {
  children: ReactNode;
  cartLink: ReactNode;
  seasonalBanner?: ReactNode;
  /** Ambientación de campaña: guirnaldas y partículas (las entrega la feature "themes"). */
  seasonalDecor?: { afterHeader?: ReactNode; beforeFooter?: ReactNode; overlay?: ReactNode };
  /** El layout público obtiene la plantilla; shared solo la representa. */
  theme?: string;
}) {
  return (
    <div
      className={`store-theme store-theme--${theme} relative flex min-h-dvh flex-col bg-background pattern-dots`}
    >
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-brand-navy px-4 py-2 font-bold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      {seasonalBanner}
      {seasonalDecor?.overlay}
      <StoreHeader cartLink={cartLink} />
      {seasonalDecor?.afterHeader}
      <main id="contenido" className="flex-1">
        {children}
      </main>
      {seasonalDecor?.beforeFooter}
      <StoreFooter />
    </div>
  );
}
