"use client";

import { useActionState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { Button } from "@/shared/ui/button";
import { TextareaField, TextField } from "@/shared/ui/form";

import { INVOICE_NUMBER_MAX, REASON_MAX } from "../../domain/admin-order";
import { registerInvoiceAction, type InvoiceFormState } from "../admin-order-actions";
import { errorSummary } from "./form-errors";

const FIELD_ID: Record<string, string> = {
  number: "factura-folio",
  reason: "factura-motivo",
};

/**
 * Folio de la factura que emite Total Kids (Flow solo cubre la boleta).
 * `replace`: corregir un folio ya registrado (solo Administrador, con motivo).
 */
export function InvoiceForm({ orderRef, replace }: { orderRef: string; replace: boolean }) {
  const [state, action, pending] = useActionState<InvoiceFormState, FormData>(
    registerInvoiceAction,
    { values: { number: "", reason: "" }, errors: {} },
  );
  const { values, errors } = state;

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={orderRef} />
      {replace ? <input type="hidden" name="replace" value="1" /> : null}
      <FormErrorSummary errors={errorSummary(errors, FIELD_ID)} />
      <div id={FIELD_ID.number} className="max-w-60 scroll-mt-24">
        <TextField
          label={replace ? "Folio correcto" : "Folio de la factura"}
          name="number"
          inputMode="numeric"
          maxLength={INVOICE_NUMBER_MAX + 10}
          autoComplete="off"
          defaultValue={values.number}
          error={errors.number}
          hint="Solo números. Los ceros a la izquierda se quitan."
        />
      </div>
      {replace ? (
        <div id={FIELD_ID.reason} className="scroll-mt-24">
          <TextareaField
            label="Motivo de la corrección"
            name="reason"
            rows={2}
            maxLength={REASON_MAX}
            defaultValue={values.reason}
            error={errors.reason}
            hint="Obligatorio. Queda en el historial del pedido."
          />
        </div>
      ) : null}
      <Button
        type="submit"
        variant={replace ? "outline" : "primary"}
        disabled={pending}
        className="self-start"
      >
        {pending ? "Guardando…" : replace ? "Corregir folio" : "Registrar factura"}
      </Button>
    </form>
  );
}
