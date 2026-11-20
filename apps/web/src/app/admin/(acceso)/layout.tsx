import type { ReactNode } from "react";

export default function AdminAccessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background pattern-dots">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-brand-navy px-4 py-2 font-bold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <main
        id="contenido"
        tabIndex={-1}
        className="flex min-h-dvh items-center px-[18px] py-7 min-[761px]:px-6 min-[761px]:py-10"
      >
        {children}
      </main>
    </div>
  );
}
