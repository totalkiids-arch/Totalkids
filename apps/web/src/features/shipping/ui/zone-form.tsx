"use client";

import Link from "next/link";
import { useActionState } from "react";

import { REGIONS } from "@/shared/config/regions";
import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Checkbox, SelectField, TextField } from "@/shared/ui/form";

import { COMMUNE_MAX, LEAD_TIME_MAX, type ShippingZone } from "../domain/shipping-zone";
import { saveZoneAction, type ZoneFormState } from "./shipping-actions";

const REGION_OPTIONS = [
  { value: "", label: "Elige una región" },
  ...REGIONS.map((r) => ({ value: r.code, label: r.name })),
];

const fieldId = (name: string) => `campo-${name}`;

/** Crear o editar una zona de despacho. */
export function ZoneForm({ editing }: { editing: ShippingZone | null }) {
  const [state, action, pending] = useActionState<ZoneFormState, FormData>(saveZoneAction, {
    values: {
      region: editing?.region ?? "RM",
      commune: editing?.commune ?? "",
      price: editing?.price == null ? "" : String(editing.price),
      leadTime: editing?.leadTime ?? "A coordinar con el taller",
      freeShippingEligible: editing?.freeShippingEligible ?? true,
      active: editing?.active ?? true,
    },
    errors: {},
  });
  const summary = Object.entries(state.errors).map(([name, message = ""]) => ({
    fieldId: name === "form" ? undefined : fieldId(name),
    message,
  }));

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={editing?.id ?? ""} />
      <FormErrorSummary errors={summary} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div id={fieldId("region")} className="scroll-mt-24">
          <SelectField
            label="Región"
            name="region"
            options={REGION_OPTIONS}
            defaultValue={state.values.region}
            error={state.errors.region}
            required
            className="[&_select]:w-full"
          />
        </div>
        <div id={fieldId("commune")} className="scroll-mt-24">
          <TextField
            label="Comuna"
            name="commune"
            defaultValue={state.values.commune}
            maxLength={COMMUNE_MAX}
            error={state.errors.commune}
            autoComplete="off"
            required
          />
        </div>
        <div id={fieldId("price")} className="scroll-mt-24">
          <TextField
            label="Tarifa (CLP)"
            name="price"
            inputMode="numeric"
            defaultValue={state.values.price}
            error={state.errors.price}
            hint="Sin decimales. 0 si no tiene costo. Vacía: «a coordinar» con el comprador."
          />
        </div>
        <div id={fieldId("leadTime")} className="scroll-mt-24">
          <TextField
            label="Plazo informado"
            name="leadTime"
            defaultValue={state.values.leadTime}
            maxLength={LEAD_TIME_MAX}
            error={state.errors.leadTime}
            hint="Lo ve el comprador al elegir el despacho."
            required
          />
        </div>
      </div>
      <Checkbox
        name="freeShippingEligible"
        value="1"
        label="Cuenta para el despacho gratis"
        defaultChecked={state.values.freeShippingEligible}
      />
      <Checkbox name="active" value="1" label="Activa" defaultChecked={state.values.active} />
      <AdminMuted>
        Solo las zonas activas se ofrecen en nuevas compras; una comuna sin zona activa queda «a
        coordinar». Los pedidos ya hechos conservan su costo de despacho.
      </AdminMuted>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear zona"}
        </Button>
        {editing ? (
          <Link href="/admin/despacho" className={buttonClasses({ variant: "outline" })}>
            Cancelar edición
          </Link>
        ) : null}
      </div>
    </form>
  );
}
