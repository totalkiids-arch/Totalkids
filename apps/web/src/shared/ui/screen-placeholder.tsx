import type { ReactNode } from "react";

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
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-dashed border-gray-300 p-8">
      <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">{section}</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-gray-600">{description}</p>
      {detail ? <p className="font-mono text-sm text-gray-500">{detail}</p> : null}
      {children}
      <p className="mt-2 text-xs text-gray-400">Pantalla pendiente de implementar.</p>
    </section>
  );
}
