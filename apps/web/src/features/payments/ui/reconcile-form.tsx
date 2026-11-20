"use client";

import { useActionState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { Button } from "@/shared/ui/button";
import { SelectField, TextareaField } from "@/shared/ui/form";

import type { ReconcileFormState } from "../domain/payment-query";

const FIELD_ID: Record<string, string> = {
  order: "conciliar-pedido",
  result: "conciliar-resultado",
  reason: "conciliar-motivo",
};

/** Respuestas simuladas de Flow. La regla de qué hace cada una vive en orders. */
const RESULTS = [
  { value: "paid", label: "Pago confirmado" },
  { value: "rejected", label: "Pago rechazado" },
  { value: "uncertain", label: "Sin respuesta: sigue incierto" },
] as const;

export type ReconcileAction = (
  state: ReconcileFormState,
  formData: FormData,
) => Promise<ReconcileFormState>;

/**
 * Consulta simulada a Flow de un pago pendiente o en revisión (RF-33). La
 * Server Action llega por props desde la página (payments no depende de
 * orders). Funciona sin JavaScript.
 */
export function ReconcileForm({
  action: reconcile,
  options,
  preselected,
}: {
  action: ReconcileAction;
  options: readonly { value: string; label: string }[];
  preselected: string;
}) {
  const [state, action, pending] = useActionState<ReconcileFormState, FormData>(reconcile, {
    values: { order: preselected, result: "uncertain", reason: "" },
    errors: {},
  });
  const { values, errors } = state;
  const summary = Object.entries(errors).flatMap(([key, message]) =>
    message ? [{ fieldId: key === "form" ? undefined : FIELD_ID[key], message }] : [],
  );

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <FormErrorSummary errors={summary} />
      <div className="grid gap-4 md:grid-cols-2">
        <div id={FIELD_ID.order} className="min-w-0 scroll-mt-24">
          <SelectField
            label="Pedido"
            name="order"
            defaultValue={values.order}
            options={options}
            error={errors.order}
            className="[&_select]:w-full"
          />
        </div>
        <div id={FIELD_ID.result} className="min-w-0 scroll-mt-24">
          <SelectField
            label="Respuesta simulada de Flow"
            name="result"
            defaultValue={values.result}
            options={RESULTS}
            error={errors.result}
            className="[&_select]:w-full"
          />
        </div>
      </div>
      <div id={FIELD_ID.reason} className="scroll-mt-24">
        <TextareaField
          label="Motivo o referencia de la revisión"
          name="reason"
          rows={2}
          maxLength={500}
          defaultValue={values.reason}
          error={errors.reason}
          hint="Obligatorio. Queda en el historial del pedido con fecha y responsable."
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Consultando…" : "Consultar estado en Flow"}
      </Button>
    </form>
  );
}
