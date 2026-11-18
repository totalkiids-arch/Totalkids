import type { ReactNode } from "react";

import { StoreFooter } from "./store-footer";
import { StoreHeader } from "./store-header";

/** Estructura común de la tienda y la cuenta del comprador: cabecera, contenido y pie. */
export function StoreShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pattern-dots">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-brand-navy px-4 py-2 font-bold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <StoreHeader />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <StoreFooter />
    </div>
  );
}
