"use client";

import { useActionState, useState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button } from "@/shared/ui/button";
import { SelectField, TextField } from "@/shared/ui/form";

import { STOCK_REASON_MAX } from "../../domain/admin-product";
import { fieldId } from "../../domain/admin-product-form";
import { adjustStockAction, type StockFormState } from "./admin-catalog-actions";

export interface StockOption {
  sku: string;
  label: string;
  physical: number;
  reserved: number;
}

/**
 * Ajuste de stock físico (RN-03, RF-34). Funciona sin JavaScript; con él, al
 * cambiar de variante se actualizan las reservas y el stock sugerido.
 */
export function StockAdjustForm({
  options,
  preselected,
}: {
  options: readonly StockOption[];
  preselected: string;
}) {
  const start = options.find((o) => o.sku === preselected) ?? options[0];
  const [state, action, pending] = useActionState<StockFormState, FormData>(adjustStockAction, {
    values: { sku: start?.sku ?? "", physical: start ? String(start.physical) : "", reason: "" },
    errors: {},
  });
  const [sku, setSku] = useState(state.values.sku);
  const selected = options.find((o) => o.sku === sku) ?? start;
  // Si el servidor devolvió errores para esta variante, se conserva lo escrito.
  const physicalDefault =
    state.values.sku === selected?.sku ? state.values.physical : String(selected?.physical ?? "");
  const summary = Object.entries(state.errors).map(([path, message]) => ({
    fieldId: path === "form" ? undefined : fieldId(`stock.${path}`),
    message,
  }));

  if (!selected) return <AdminMuted>No hay variantes para ajustar.</AdminMuted>;

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <FormErrorSummary errors={summary} />
      <div className="grid gap-4 md:grid-cols-2">
        <div id={fieldId("stock.sku")} className="min-w-0 scroll-mt-24">
          <SelectField
            label="Variante"
            name="sku"
            value={selected.sku}
            onChange={(event) => setSku(event.target.value)}
            options={options.map((o) => ({ value: o.sku, label: o.label }))}
            error={state.errors.sku}
          />
        </div>
        <div id={fieldId("stock.physical")} className="min-w-0 scroll-mt-24">
          <TextField
            key={selected.sku}
            label="Nuevo stock físico"
            name="physical"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={physicalDefault}
            error={state.errors.physical}
            hint={`Actual: ${selected.physical} · Reservado: ${selected.reserved}. Debe ser un entero de al menos ${selected.reserved}.`}
          />
        </div>
      </div>
      <div id={fieldId("stock.reason")} className="scroll-mt-24">
        <TextField
          label="Motivo del ajuste"
          name="reason"
          defaultValue={state.values.reason}
          maxLength={STOCK_REASON_MAX}
          placeholder="Conteo físico, merma, recepción de fábrica…"
          error={state.errors.reason}
          hint="Obligatorio. Queda en el historial con fecha y responsable."
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Registrando…" : "Registrar ajuste"}
      </Button>
    </form>
  );
}
