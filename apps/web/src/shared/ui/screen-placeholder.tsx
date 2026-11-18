import type { ReactNode } from "react";

import { Tito } from "@/shared/ui/brand/tito";

interface ScreenPlaceholderProps {
  section: string;
  title: string;
  description: string;
  /** Dato de contexto (p. ej. el parámetro de la ruta). */
  detail?: string;
  children?: ReactNode;
}

/** Marcador temporal para pantallas aún no implementadas. */
export function ScreenPlaceholder({
  section,
  title,
  description,
  detail,
  children,
}: ScreenPlaceholderProps) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-3xl border-2 border-dashed border-border bg-surface p-8 shadow-sm">
      <p className="text-xs font-extrabold tracking-wide text-brand-blue uppercase">{section}</p>
      <h1 className="text-3xl">{title}</h1>
      <p className="text-text-secondary">{description}</p>
      {detail ? <p className="font-mono text-sm text-text-secondary">{detail}</p> : null}
      {children}
      <p className="mt-2 flex items-center gap-3 text-xs text-text-secondary">
        <Tito className="w-10 shrink-0" />
        Tito está armando esta pantalla. Pendiente de implementar.
      </p>
    </section>
  );
}
