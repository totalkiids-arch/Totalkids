import Link from "next/link";
import type { ReactNode } from "react";

import { adminNav } from "@/shared/config/routes";
import { Logo } from "@/shared/ui/brand/logo";

/** Estructura del panel administrativo: menú lateral y contenido. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="shrink-0 border-b border-border bg-surface md:w-64 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <Logo size="sm" />
          <span className="rounded-full bg-soft-blue px-2 py-0.5 text-xs font-extrabold text-brand-blue">
            Admin
          </span>
        </div>
        <nav aria-label="Panel administrativo">
          <ul className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm md:flex-col md:overflow-visible">
            {adminNav.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className="block rounded-xl px-3 py-2 font-bold hover:bg-soft-yellow"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main id="contenido" className="flex-1 px-4 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}
