const STEPS = ["Carrito", "Datos y facturación", "Pago", "¡Listo!"] as const;

/** Pasos de compra (carrito → datos → pago → listo). `current` empieza en 1. */
export function CheckoutSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Pasos de compra" className="mx-auto max-w-240 px-4 pt-7 pb-2 sm:px-6">
      <ol className="flex flex-wrap items-center justify-center gap-2.5">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const state = step < current ? "done" : step === current ? "current" : "next";
          return (
            <li key={label} className="flex items-center gap-2.5">
              {i > 0 ? (
                <span aria-hidden className="h-1 w-6 rounded-sm bg-chip-border sm:w-10" />
              ) : null}
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={`flex items-center gap-2 font-extrabold ${state === "next" ? "text-text-secondary" : ""}`}
              >
                <span
                  className={`flex size-10 items-center justify-center rounded-[14px] font-heading text-xl ${
                    state === "current"
                      ? "bg-brand-blue text-white shadow-[0_4px_0_var(--color-brand-blue-deep)]"
                      : state === "done"
                        ? "bg-brand-green text-white"
                        : "border-2 border-chip-border bg-surface"
                  }`}
                >
                  {step}
                </span>
                <span className={state === "current" ? "" : "max-sm:sr-only"}>
                  {label}
                  {state === "done" ? <span className="sr-only"> (completado)</span> : null}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
