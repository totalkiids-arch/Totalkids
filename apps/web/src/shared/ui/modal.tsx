"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Acciones al pie (botones). */
  footer?: ReactNode;
  /** "sheet": en móvil sube desde abajo y ocupa el ancho (filtros, menús). */
  variant?: "dialog" | "sheet";
}

/**
 * Modal accesible sobre <dialog> nativo (showModal):
 * - el foco queda dentro y vuelve al botón que lo abrió al cerrar,
 * - Esc y el botón "Cerrar" lo cierran; también un clic en el fondo,
 * - el resto de la página queda inerte y sin scroll mientras está abierto.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "dialog",
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const layout =
    variant === "sheet"
      ? "mt-auto mb-0 w-full max-w-none rounded-t-[28px] sm:m-auto sm:max-w-lg sm:rounded-[28px]"
      : "m-auto w-[calc(100%-2rem)] max-w-lg rounded-[28px]";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // "close" se dispara con Esc, form method=dialog y dialog.close().
      onClose={onClose}
      onClick={(event) => {
        // Clic en el fondo: el target es el propio <dialog>, no su contenido.
        if (event.target === event.currentTarget) onClose();
      }}
      className={`${layout} max-h-[90dvh] bg-surface p-0 text-text-primary shadow-[0_24px_60px_-20px_rgb(31_42_68/0.45)] backdrop:bg-brand-navy/55 motion-safe:open:animate-pop-in`}
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 pt-5 pb-4">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-2xl leading-tight font-extrabold">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-[15px] text-text-secondary">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-primary hover:bg-soft-yellow"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
