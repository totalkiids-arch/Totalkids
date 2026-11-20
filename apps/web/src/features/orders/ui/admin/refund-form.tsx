"use client";

import { useActionState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { Button } from "@/shared/ui/button";
import { RadioGroup, TextField } from "@/shared/ui/form";

import { REFERENCE_MAX } from "../../domain/order-workflow";
import { registerRefundAction, type RefundFormState } from "../admin-order-actions";
import { errorSummary } from "./form-errors";

const FIELD_ID: Record<string, string> = {
  amount: "reembolso-monto",
  date: "reembolso-fecha",
  reference: "reembolso-referencia",
  status: "reembolso-estado",
};

/**
 * Registro de un reembolso manual (RF-32). No mueve dinero: deja constancia de
 * una devolución hecha o solicitada por un mecanismo externo. Solo Administrador.
 */
export function RefundForm({
  orderId,
  remaining,
  minDate,
  today,
}: {
  orderId: string;
  /** Monto que aún se puede registrar, en CLP. */
  remaining: number;
  /** Fecha del cobro (AAAA-MM-DD). */
  minDate: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<RefundFormState, FormData>(registerRefundAction, {
    values: { amount: "", date: today, reference: "", status: "processed" },
    errors: {},
  });
  const { values, errors } = state;

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={orderId} />
      <FormErrorSummary errors={errorSummary(errors, FIELD_ID)} />

      <div className="grid gap-4 md:grid-cols-2">
        <div id={FIELD_ID.amount} className="min-w-0 scroll-mt-24">
          <TextField
            label="Monto CLP"
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={values.amount}
            error={errors.amount}
            hint={`Entero mayor que 0. Disponible: $${remaining.toLocaleString("es-CL")}.`}
          />
        </div>
        <div id={FIELD_ID.date} className="min-w-0 scroll-mt-24">
          <TextField
            label="Fecha del reembolso"
            name="date"
            type="date"
            min={minDate}
            max={today}
            defaultValue={values.date}
            error={errors.date}
          />
        </div>
      </div>

      <div id={FIELD_ID.reference} className="scroll-mt-24">
        <TextField
          label="Referencia del comprobante"
          name="reference"
          maxLength={REFERENCE_MAX}
          autoComplete="off"
          defaultValue={values.reference}
          placeholder="N.º de transferencia, ticket de Flow…"
          error={errors.reference}
        />
      </div>

      <div id={FIELD_ID.status} className="scroll-mt-24">
        <RadioGroup
          legend="Estado del reembolso"
          name="status"
          defaultValue={values.status}
          error={errors.status}
          options={[
            {
              value: "processed",
              label: "Procesado",
              description: "La devolución ya se hizo por fuera.",
            },
            {
              value: "requested",
              label: "Solicitado",
              description: "Está en trámite; luego se marca Procesado o Fallido.",
            },
          ]}
        />
      </div>

      <Button type="submit" variant="danger" disabled={pending} className="self-start">
        {pending ? "Registrando…" : "Registrar devolución externa"}
      </Button>
    </form>
  );
}
