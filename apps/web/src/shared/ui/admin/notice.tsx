"use client";

import { useEffect, useRef, type ReactNode } from "react";

const NOTICE_TONES = {
  success: "border-brand-green/30 bg-soft-green text-brand-green",
  info: "border-brand-blue/30 bg-soft-blue text-brand-blue",
  warning: "border-input-border bg-cream text-yellow-ink",
} as const;

/**
 * Aviso de resultado (p. ej. "Producto guardado"). role="status" lo anuncia sin
 * interrumpir; con o sin JavaScript, el mensaje queda visible en la página.
 */
export function LiveNotice({
  message,
  tone = "success",
}: {
  message: ReactNode;
  tone?: keyof typeof NOTICE_TONES;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-5 rounded-lg border px-4 py-3.5 text-sm font-bold ${NOTICE_TONES[tone]}`}
    >
      {message}
    </div>
  );
}

/** Aviso fijo informativo (p. ej. una regla que conviene tener a la vista). */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 rounded-lg border border-input-border bg-cream px-4 py-3.5 text-sm text-on-yellow">
      {children}
    </div>
  );
}

export interface FormErrorItem {
  /** id del campo con error, para enlazarlo. */
  fieldId?: string;
  message: string;
}

/**
 * Resumen de errores al enviar un formulario. Recibe el foco al aparecer, así
 * teclado y lector de pantalla llegan directo a la lista (RNF-09).
 */
export function FormErrorSummary({
  title = "Revisa los datos marcados",
  errors,
}: {
  title?: string;
  errors: readonly FormErrorItem[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = errors.map((e) => `${e.fieldId ?? ""}:${e.message}`).join("|");
  useEffect(() => {
    if (signature) ref.current?.focus();
  }, [signature]);
  if (errors.length === 0) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="mb-5 rounded-lg border-2 border-brand-red bg-soft-red px-4 py-3.5 text-sm text-brand-red-deep focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-red"
    >
      <p className="font-extrabold">{title}</p>
      <ul className="mt-1.5 list-disc pl-5">
        {errors.map((error, index) => (
          <li key={`${error.fieldId ?? "form"}-${index}`}>
            {error.fieldId ? (
              <a
                href={`#${error.fieldId}`}
                className="font-bold underline"
                onClick={(event) => {
                  // Lleva el foco al control con error (el id puede ser del campo o de su contenedor).
                  const target = document.getElementById(error.fieldId ?? "");
                  const control = target?.matches("input, select, textarea")
                    ? target
                    : target?.querySelector<HTMLElement>(
                        "input:not([type=hidden]), select, textarea",
                      );
                  if (!control) return;
                  event.preventDefault();
                  control.focus();
                  control.scrollIntoView({ block: "center" });
                }}
              >
                {error.message}
              </a>
            ) : (
              error.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
