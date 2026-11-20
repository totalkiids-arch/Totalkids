"use client";

import { useActionState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form";

import {
  PICKUP_MAX,
  RESERVATION_MAX,
  RESERVATION_MIN,
  type ShippingSettings,
} from "../domain/shipping-zone";
import { saveSettingsAction, type SettingsFormState } from "./shipping-actions";

const fieldId = (name: string) => `condicion-${name}`;

/** Retiro en tienda, umbral de despacho gratis y duración de la reserva de stock. */
export function ShippingSettingsForm({ settings }: { settings: ShippingSettings }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveSettingsAction, {
    values: {
      pickup: settings.pickup,
      freeShippingThreshold:
        settings.freeShippingThreshold === null ? "" : String(settings.freeShippingThreshold),
      reservationMinutes: String(settings.reservationMinutes),
    },
    errors: {},
  });
  const summary = Object.entries(state.errors).map(([name, message = ""]) => ({
    fieldId: name === "form" ? undefined : fieldId(name),
    message,
  }));

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <FormErrorSummary errors={summary} />
      <div id={fieldId("pickup")} className="scroll-mt-24">
        <TextField
          label="Dirección y horario de retiro"
          name="pickup"
          defaultValue={state.values.pickup}
          maxLength={PICKUP_MAX}
          error={state.errors.pickup}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div id={fieldId("freeShippingThreshold")} className="scroll-mt-24">
          <TextField
            label="Despacho gratis desde (CLP)"
            name="freeShippingThreshold"
            inputMode="numeric"
            defaultValue={state.values.freeShippingThreshold}
            error={state.errors.freeShippingThreshold}
            hint="Subtotal de productos. Déjalo vacío si no hay despacho gratis."
          />
        </div>
        <div id={fieldId("reservationMinutes")} className="scroll-mt-24">
          <TextField
            label="Duración de la reserva (minutos)"
            name="reservationMinutes"
            inputMode="numeric"
            defaultValue={state.values.reservationMinutes}
            error={state.errors.reservationMinutes}
            hint={`Tiempo que el stock queda apartado mientras se paga (${RESERVATION_MIN} a ${RESERVATION_MAX}).`}
            required
          />
        </div>
      </div>
      <AdminMuted>
        El retiro en tienda es gratis. El umbral aplica solo a las zonas activas.
      </AdminMuted>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar condiciones"}
      </Button>
    </form>
  );
}
