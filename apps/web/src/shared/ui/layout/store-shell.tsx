import Link from "next/link";
import type { ReactNode } from "react";

import { accountNav, storeFooterNav, storeNav } from "@/shared/config/routes";

/** Estructura común de la tienda y la cuenta del comprador: cabecera, contenido y pie. */
export function StoreShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-gray-200">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-4">
          <Link href="/" className="text-lg font-semibold">
            Total Kids
          </Link>
          <ul className="flex gap-4 text-sm">
            {storeNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
          <ul className="ml-auto flex gap-4 text-sm">
            {accountNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
            <li>
              <Link href="/carrito">Carrito</Link>
            </li>
          </ul>
        </nav>
      </header>
      <main className="flex-1 px-6 py-10">{children}</main>
      <footer className="border-t border-gray-200">
        <ul className="mx-auto flex max-w-6xl gap-4 px-6 py-6 text-sm text-gray-600">
          {storeFooterNav.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
