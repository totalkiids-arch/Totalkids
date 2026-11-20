"use client";

import { useActionState } from "react";

import { FormErrorSummary, type FormErrorItem } from "@/shared/ui/admin/notice";
import { Button } from "@/shared/ui/button";
import { SelectField, TextareaField } from "@/shared/ui/form";

import {
  NOTE_MAX,
  REQUEST_STATUS_LABEL,
  type FollowUpErrors,
  type RequestStatus,
} from "../../domain/service-request-admin";
import { saveRequestFollowUpAction, type FollowUpFormState } from "./request-admin-actions";

const FIELD_ID = { status: "seguimiento-estado", note: "seguimiento-nota" } as const;

function summary(errors: FollowUpErrors): FormErrorItem[] {
  const items: FormErrorItem[] = [];
  if (errors.form) items.push({ message: errors.form });
  if (errors.status) items.push({ fieldId: FIELD_ID.status, message: errors.status });
  if (errors.note) items.push({ fieldId: FIELD_ID.note, message: errors.note });
  return items;
}

/**
 * Seguimiento de una solicitud: estado (solo las transiciones permitidas) y
 * nota interna. El servidor vuelve a validar. Funciona sin JavaScript.
 */
export function RequestFollowUpForm({
  requestId,
  status,
  note,
  options,
  filters,
}: {
  requestId: string;
  status: RequestStatus;
  note: string;
  options: readonly RequestStatus[];
  /** Filtros del listado, para volver a ellos al guardar. */
  filters: string;
}) {
  const [state, action, pending] = useActionState<FollowUpFormState, FormData>(
    saveRequestFollowUpAction,
    { values: { status, note }, errors: {} },
  );
  const { values, errors } = state;

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={requestId} />
      <input type="hidden" name="filters" value={filters} />
      <FormErrorSummary errors={summary(errors)} />

      <div id={FIELD_ID.status} className="scroll-mt-24">
        <SelectField
          label="Estado"
          name="status"
          defaultValue={values.status}
          options={options.map((value) => ({
            value,
            label:
              value === status
                ? `${REQUEST_STATUS_LABEL[value]} (actual)`
                : REQUEST_STATUS_LABEL[value],
          }))}
          error={errors.status}
          hint="Nueva → En gestión → Resuelta. Una resuelta se puede reabrir; nunca vuelve a Nueva."
        />
      </div>

      <div id={FIELD_ID.note} className="scroll-mt-24">
        <TextareaField
          label="Nota interna"
          name="note"
          rows={4}
          defaultValue={values.note}
          maxLength={NOTE_MAX}
          error={errors.note}
          hint={`Solo la ve el personal del panel. Máximo ${NOTE_MAX} caracteres.`}
        />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar seguimiento"}
      </Button>
    </form>
  );
}
