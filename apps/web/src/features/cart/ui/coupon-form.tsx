"use client";

import { useActionState } from "react";

import { applyCouponAction, type CouponState } from "./cart-actions";

/** Cupón de descuento (RF-07). La validación ocurre en el servidor. */
export function CouponForm() {
  const [state, action, pending] = useActionState<CouponState, FormData>(applyCouponAction, null);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <label htmlFor="cupon" className="text-sm font-extrabold">
        Cupón de descuento
      </label>
      <div className="flex gap-2">
        <input
          id="cupon"
          name="cupon"
          autoComplete="off"
          placeholder="Ej: KIDS10"
          maxLength={40}
          aria-invalid={state?.tone === "error" ? true : undefined}
          aria-describedby={state ? "cupon-mensaje" : undefined}
          className="h-11.5 min-w-0 flex-1 rounded-[14px] border-2 border-chip-border bg-surface px-3.5 text-[15px] uppercase placeholder:normal-case"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11.5 rounded-[14px] bg-brand-yellow px-4.5 font-extrabold text-brand-navy disabled:opacity-60"
        >
          {pending ? "Validando…" : "Aplicar"}
        </button>
      </div>
      <p
        id="cupon-mensaje"
        aria-live="polite"
        className={`text-sm font-bold empty:hidden ${state?.tone === "success" ? "text-brand-green" : "text-brand-red-deep"}`}
      >
        {state?.message}
      </p>
    </form>
  );
}
