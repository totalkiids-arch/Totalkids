import { useId, type ReactNode } from "react";

/**
 * Tarjeta blanca del panel. `flush` quita el relleno (para tablas).
 * Con título, la sección queda rotulada para lectores de pantalla.
 */
export function AdminPanel({
  title,
  description,
  actions,
  flush = false,
  id,
  className = "",
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={`mb-6 min-w-0 scroll-mt-6 rounded-xl border border-border bg-surface ${flush ? "overflow-hidden" : "p-5 sm:p-6"} ${className}`}
    >
      {title ? (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 ${flush ? "border-b border-border px-5 py-5 sm:px-6" : "mb-4"}`}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={headingId} className="font-heading text-xl font-extrabold sm:text-[23px]">
              {title}
            </h2>
            {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Texto de apoyo gris de los formularios del panel. */
export function AdminMuted({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-[13px] text-text-secondary">
      {children}
    </p>
  );
}
