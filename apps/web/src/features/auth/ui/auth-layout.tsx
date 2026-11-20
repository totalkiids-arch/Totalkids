import type { ReactNode } from "react";

import { Tito } from "@/shared/ui/brand/tito";
import { ButtonLink } from "@/shared/ui/button";

/**
 * Diseño común de las pantallas de cuenta: presentación a la izquierda y
 * formulario a la derecha (en móvil, uno debajo del otro).
 */
export function AuthLayout({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  /** Contenido extra bajo el formulario (p. ej. consulta de pedido invitado). */
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-6 px-4 py-8 sm:px-6">
      <section className="flex flex-[1_1_320px] flex-col items-start gap-4 rounded-[32px] bg-brand-yellow p-7 sm:p-9">
        <Tito className="w-24" />
        <p className="font-heading text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-extrabold">
          Un espacio para grandes aventuras.
        </p>
        <p className="text-lg text-on-yellow">
          Consulta tus pedidos y acompaña cada paso de tus muebles favoritos.
        </p>
        <ButtonLink href="/catalogo" variant="light">
          Explorar el catálogo
        </ButtonLink>
      </section>
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-[32px] bg-surface p-6 shadow-[0_2px_0_var(--color-border)] sm:p-8">
          <h1 className="text-[clamp(2rem,4vw,2.5rem)] leading-tight font-extrabold">{title}</h1>
          {children}
        </section>
        {aside}
      </div>
    </div>
  );
}

/** Aviso común: las cuentas aún son de demostración (hasta LN-04). */
export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl bg-cream px-4 py-3 text-sm">
      <strong>Demostración.</strong> {children}
    </p>
  );
}
