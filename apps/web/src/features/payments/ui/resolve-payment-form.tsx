"use client";

import { useActionState } from "react";

import { FormErrorSummary, type FormErrorItem } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button } from "@/shared/ui/button";
import { SelectField, TextareaField } from "@/shared/ui/form";

import {
  RESOLUTION_HELP,
  RESOLUTION_LABEL,
  RESOLUTION_REASON_MAX,
  type PaymentResolution,
} from "../domain/reconciliation";
import { resolvePaymentAction, type ResolveFormState } from "./payment-actions";

const FIELD_ID: Record<string, string> = {
  action: "resolver-pago-accion",
  reason: "resolver-pago-motivo",
};

function errorSummary(errors: ResolveFormState["errors"]): FormErrorItem[] {
  return Object.entries(errors).flatMap(([key, message]) =>
    message ? [{ fieldId: key === "form" ? undefined : FIELD_ID[key], message }] : [],
  );
}

/**
 * Resolución manual de un pago en revisión (RF-33, RN-05, RN-06). Solo el
 * Administrador: la pantalla lo muestra solo a él y la acción y la API lo
 * vuelven a exigir. Solo ofrece las resoluciones que la API permite ahora.
 * Funciona sin JavaScript.
 */
export function ResolvePaymentForm({
  paymentId,
  resolutions,
  volver,
}: {
  paymentId: string;
  resolutions: readonly PaymentResolution[];
  volver: string;
}) {
  const [state, action, pending] = useActionState<ResolveFormState, FormData>(
    resolvePaymentAction,
    { values: { action: resolutions[0] ?? "", reason: "" }, errors: {} },
  );
  const { values, errors } = state;

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={paymentId} />
      <input type="hidden" name="volver" value={volver} />
      <FormErrorSummary errors={errorSummary(errors)} />
      <div id={FIELD_ID.action} className="scroll-mt-24">
        <SelectField
          label="Resolución"
          name="action"
          defaultValue={values.action}
          options={resolutions.map((r) => ({ value: r, label: RESOLUTION_LABEL[r] }))}
          error={errors.action}
        />
      </div>
      <ul className="list-disc pl-5 text-xs text-text-secondary">
        {resolutions.map((r) => (
          <li key={r}>
            <strong>{RESOLUTION_LABEL[r]}:</strong> {RESOLUTION_HELP[r]}
          </li>
        ))}
      </ul>
      <div id={FIELD_ID.reason} className="scroll-mt-24">
        <TextareaField
          label="Motivo"
          name="reason"
          rows={3}
          defaultValue={values.reason}
          maxLength={RESOLUTION_REASON_MAX}
          error={errors.reason}
          hint="Obligatorio. Queda en el historial con fecha y responsable."
        />
      </div>
      <AdminMuted>
        Resolver no mueve dinero: una devolución se registra con un reembolso manual.
      </AdminMuted>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Resolver pago"}
      </Button>
    </form>
  );
}
