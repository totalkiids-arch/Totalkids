import type { ReactNode } from "react";

/**
 * Encabezado de una pantalla del panel: título, descripción y acciones
 * (p. ej. "Nuevo producto"). En pantallas angostas las acciones bajan.
 */
export function AdminPageHeading({
  title,
  description,
  actions,
  crumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Migas de pan sobre el título (p. ej. Productos / Editar). */
  crumb?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      {crumb ? (
        <nav aria-label="Ruta de navegación" className="text-sm font-bold text-text-secondary">
          {crumb}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-heading text-3xl font-extrabold sm:text-4xl">{title}</h1>
          {description ? <p className="max-w-[65ch] text-text-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
