import type { ReactNode } from "react";

import { Logo } from "@/shared/ui/brand/logo";
import { ButtonLink } from "@/shared/ui/button";

/**
 * Marco de las pantallas de acceso del panel (ingreso y contraseña): bienvenida
 * a la izquierda y tarjeta con el formulario a la derecha.
 */
export function AccessFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-[960px] items-center gap-4 min-[761px]:grid-cols-2 min-[761px]:gap-16">
      <section aria-labelledby="bienvenida-panel" className="flex flex-col gap-4">
        <Logo size="lg" className="max-[760px]:hidden" />
        <h1
          id="bienvenida-panel"
          className="font-heading text-[33px] leading-[1.05] font-extrabold min-[761px]:text-[52px]"
        >
          Todo para hacer crecer tu tienda.
        </h1>
        <p className="text-[15px] text-text-body min-[761px]:text-lg">
          Pedidos, muebles y pequeños detalles. Administra Total Kids desde un mismo lugar.
        </p>
        <ButtonLink href="/" variant="light" className="self-start">
          Ver tienda
        </ButtonLink>
      </section>

      <section
        aria-labelledby="titulo-acceso"
        className="rounded-[22px] bg-surface p-[22px] shadow-[0_2px_0_var(--color-border),0_10px_30px_-22px_rgb(31_42_68/0.35)] min-[761px]:rounded-[28px] min-[761px]:p-8"
      >
        <h2 id="titulo-acceso" className="font-heading text-[30px] leading-tight font-extrabold">
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}

/** Mensaje general de un formulario de acceso (credenciales, espera, API caída). */
export function AccessAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-2xl border-2 border-brand-red bg-soft-red px-4 py-3 text-sm font-bold text-brand-red-deep"
    >
      {children}
    </p>
  );
}

/** Aviso positivo (contraseña actualizada, enlace enviado). */
export function AccessNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="mt-4 rounded-2xl border border-brand-green/30 bg-soft-green px-4 py-3 text-sm font-bold text-brand-green"
    >
      {children}
    </p>
  );
}
