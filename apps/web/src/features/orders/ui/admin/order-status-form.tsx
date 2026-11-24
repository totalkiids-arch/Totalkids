"use client";

import { useActionState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button } from "@/shared/ui/button";
import { Checkbox, SelectField, TextareaField, TextField } from "@/shared/ui/form";

import { REASON_MAX, TRACKING_MAX } from "../../domain/admin-order";
import { changeOrderStatusAction, type StatusFormState } from "../admin-order-actions";
import { errorSummary } from "./form-errors";

const FIELD_ID: Record<string, string> = {
  to: "estado-nuevo",
  carrier: "estado-transportista",
  code: "estado-seguimiento",
  restock: "estado-reposicion",
  reason: "estado-motivo",
};

/**
 * Cambio de estado del pedido (RF-27). Solo ofrece las transiciones que la API
 * permite ahora; la API las vuelve a validar. Funciona sin JavaScript.
 * En retiro en taller, "Despachado" es "Listo para retiro": sin transportista
 * ni seguimiento.
 */
export function OrderStatusForm({
  orderId,
  options,
  showTracking,
  tracking,
  showRestock,
  cancelsPaidOrder,
}: {
  orderId: string;
  options: readonly { value: string; label: string }[];
  /** Despachar a domicilio está entre las opciones: se piden transportista y seguimiento. */
  showTracking: boolean;
  tracking: { carrier: string; code: string } | null;
  /** Cancelar puede registrar la reposición de stock (una sola vez, RN-06). */
  showRestock: boolean;
  /** Cancelar este pedido no devuelve el dinero cobrado. */
  cancelsPaidOrder: boolean;
}) {
  const [state, action, pending] = useActionState<StatusFormState, FormData>(
    changeOrderStatusAction,
    {
      values: {
        to: options[0]?.value ?? "",
        reason: "",
        carrier: tracking?.carrier ?? "",
        code: tracking?.code ?? "",
        restock: false,
      },
      errors: {},
    },
  );
  const { values, errors } = state;

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={orderId} />
      <FormErrorSummary errors={errorSummary(errors, FIELD_ID)} />

      <div id={FIELD_ID.to} className="scroll-mt-24">
        <SelectField
          label="Nuevo estado"
          name="to"
          defaultValue={values.to}
          options={options}
          error={errors.to}
        />
      </div>

      {showTracking ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div id={FIELD_ID.carrier} className="min-w-0 scroll-mt-24">
            <TextField
              label="Transportista"
              name="carrier"
              defaultValue={values.carrier}
              maxLength={TRACKING_MAX}
              autoComplete="off"
              error={errors.carrier}
              hint="Obligatorio para despachar a domicilio."
            />
          </div>
          <div id={FIELD_ID.code} className="min-w-0 scroll-mt-24">
            <TextField
              label="Código o referencia de seguimiento"
              name="code"
              defaultValue={values.code}
              maxLength={TRACKING_MAX}
              autoComplete="off"
              error={errors.code}
              hint="Obligatorio para despachar a domicilio."
            />
          </div>
        </div>
      ) : null}

      {showRestock ? (
        <div id={FIELD_ID.restock} className="scroll-mt-24">
          <Checkbox
            name="restock"
            value="1"
            defaultChecked={values.restock}
            label="Al cancelar, registrar la reposición de stock: las unidades son vendibles"
            description="Se registra una sola vez por pedido: repone en el inventario lo que la venta descontó."
          />
          {errors.restock ? (
            <p className="text-sm font-bold text-brand-red">{errors.restock}</p>
          ) : null}
        </div>
      ) : null}

      <div id={FIELD_ID.reason} className="scroll-mt-24">
        <TextareaField
          label="Motivo del cambio"
          name="reason"
          rows={3}
          defaultValue={values.reason}
          maxLength={REASON_MAX}
          error={errors.reason}
          hint="Obligatorio. Queda en el historial con fecha y responsable."
        />
      </div>

      <AdminMuted>
        {showTracking
          ? "Para despachar se requiere pago confirmado, transportista y seguimiento."
          : "Para avanzar se requiere pago confirmado."}
        {cancelsPaidOrder
          ? " Cancelar no devuelve dinero: la devolución se gestiona aparte con un reembolso manual."
          : ""}
      </AdminMuted>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar cambio"}
      </Button>
    </form>
  );
}
