import Link from "next/link";
import type { ReactNode } from "react";

import { adminNav } from "@/shared/config/routes";

/** Estructura del panel administrativo: menú lateral y contenido. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-gray-50">
        <p className="px-5 py-4 font-semibold">Total Kids · Admin</p>
        <nav>
          <ul className="flex flex-col text-sm">
            {adminNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block px-5 py-2 hover:bg-gray-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 px-8 py-10">{children}</main>
    </div>
  );
}
