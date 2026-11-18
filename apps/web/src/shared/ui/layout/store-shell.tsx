import Link from "next/link";
import type { ReactNode } from "react";

import { accountNav, storeFooterNav, storeNav } from "@/shared/config/routes";
import { Logo } from "@/shared/ui/brand/logo";

const navLink = "rounded-full px-3 py-1.5 font-bold hover:bg-soft-yellow";

/** Estructura común de la tienda y la cuenta del comprador: cabecera, contenido y pie. */
export function StoreShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only rounded-full bg-brand-navy px-4 py-2 font-bold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-border bg-surface">
        <nav
          aria-label="Principal"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6"
        >
          <Link href="/" aria-label="Total Kids, ir al inicio" className="rounded-2xl">
            <Logo size="md" />
          </Link>
          <ul className="flex gap-1 text-sm">
            {storeNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={navLink}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="ml-auto flex gap-1 text-sm">
            {accountNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={navLink}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/carrito"
                className="rounded-full bg-brand-yellow px-4 py-1.5 font-extrabold text-brand-navy hover:brightness-95"
              >
                Carrito
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      <main id="contenido" className="flex-1 px-4 py-10 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <Logo size="sm" />
          <nav aria-label="Pie de página">
            <ul className="flex gap-1 text-sm text-text-secondary">
              {storeFooterNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={navLink}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
