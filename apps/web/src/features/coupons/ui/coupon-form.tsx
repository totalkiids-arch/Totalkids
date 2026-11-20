"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Checkbox, RadioGroup, TextField } from "@/shared/ui/form";

import { CODE_MAX, hasLockedTerms, LOCKED_BY_USES, type Coupon } from "../domain/coupon";
import { saveCouponAction, type CouponFormState } from "./coupon-actions";

const KIND_OPTIONS = [
  { value: "percent", label: "Porcentaje", description: "Entero de 1 a 100 sobre el subtotal." },
  { value: "amount", label: "Monto fijo", description: "Pesos chilenos, sin decimales." },
];
const KIND_LABEL: Record<string, string> = { percent: "Porcentaje", amount: "Monto fijo" };

/** Los campos bloqueados se ven distintos aunque no estén deshabilitados (sí se envían). */
const READ_ONLY = "[&_input]:bg-background [&_input]:text-text-secondary";

const fieldId = (name: string) => `campo-${name}`;

/** Crear o editar un cupón. Con usos, código, tipo y valor quedan de solo lectura. */
export function CouponForm({
  editing,
  defaultStart,
  defaultEnd,
}: {
  editing: Coupon | null;
  /** Fechas sugeridas para un cupón nuevo (calculadas en el servidor, hora de Chile). */
  defaultStart: string;
  defaultEnd: string;
}) {
  const [state, action, pending] = useActionState<CouponFormState, FormData>(saveCouponAction, {
    values: {
      code: editing?.code ?? "",
      kind: editing?.kind ?? "percent",
      value: editing ? String(editing.value) : "",
      startsOn: editing?.startsOn ?? defaultStart,
      endsOn: editing?.endsOn ?? defaultEnd,
      maxUses: editing ? String(editing.maxUses) : "100",
      active: editing?.active ?? true,
    },
    errors: {},
  });
  const locked = hasLockedTerms(editing);
  const summary = Object.entries(state.errors).map(([name, message = ""]) => ({
    fieldId: name === "form" ? undefined : fieldId(name),
    message,
  }));

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={editing?.id ?? ""} />
      <FormErrorSummary errors={summary} />
      {locked ? (
        <AdminMuted>
          Este cupón ya se usó {editing?.uses} {editing?.uses === 1 ? "vez" : "veces"}.{" "}
          {LOCKED_BY_USES} Puedes cambiar las fechas, el máximo de usos y el estado.
        </AdminMuted>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div id={fieldId("code")} className="scroll-mt-24">
          <TextField
            label="Código"
            name="code"
            defaultValue={state.values.code}
            maxLength={CODE_MAX + 10}
            error={state.errors.code}
            hint={
              locked
                ? LOCKED_BY_USES
                : "Se guarda en mayúsculas y sin espacios. Letras A–Z, números, - y _."
            }
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            readOnly={locked}
            className={locked ? READ_ONLY : ""}
            required
          />
        </div>
        <div id={fieldId("kind")} className="scroll-mt-24">
          {locked ? (
            <>
              <input type="hidden" name="kind" value={state.values.kind} />
              <TextField
                label="Tipo de descuento"
                value={KIND_LABEL[state.values.kind] ?? ""}
                readOnly
                hint={LOCKED_BY_USES}
                error={state.errors.kind}
                className={READ_ONLY}
              />
            </>
          ) : (
            <RadioGroup
              legend="Tipo de descuento"
              name="kind"
              options={KIND_OPTIONS}
              defaultValue={state.values.kind}
              error={state.errors.kind}
              required
            />
          )}
        </div>
        <div id={fieldId("value")} className="scroll-mt-24">
          <TextField
            label="Valor"
            name="value"
            inputMode="numeric"
            defaultValue={state.values.value}
            error={state.errors.value}
            hint={
              locked
                ? LOCKED_BY_USES
                : "Porcentaje: entero de 1 a 100. Monto fijo: pesos sin decimales (p. ej. 5000)."
            }
            readOnly={locked}
            className={locked ? READ_ONLY : ""}
            required
          />
        </div>
        <div id={fieldId("maxUses")} className="scroll-mt-24">
          <TextField
            label="Máximo de usos"
            name="maxUses"
            inputMode="numeric"
            defaultValue={state.values.maxUses}
            error={state.errors.maxUses}
            hint={
              editing
                ? `Usos consumidos: ${editing.uses}. El máximo no puede ser menor.`
                : "Total de pedidos que pueden usar el cupón."
            }
            required
          />
        </div>
        <div id={fieldId("startsOn")} className="scroll-mt-24">
          <TextField
            label="Inicio"
            name="startsOn"
            type="date"
            defaultValue={state.values.startsOn}
            error={state.errors.startsOn}
            required
          />
        </div>
        <div id={fieldId("endsOn")} className="scroll-mt-24">
          <TextField
            label="Término"
            name="endsOn"
            type="date"
            defaultValue={state.values.endsOn}
            error={state.errors.endsOn}
            hint="Último día de vigencia, inclusive (hora de Chile)."
            required
          />
        </div>
      </div>
      <Checkbox name="active" value="1" label="Activo" defaultChecked={state.values.active} />
      <AdminMuted>
        Un cupón por pedido; no aplica al despacho. Los usos se consumen al pagar. Editar no cambia
        pedidos anteriores.
      </AdminMuted>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear cupón"}
        </Button>
        {editing ? (
          <Link href="/admin/cupones" className={buttonClasses({ variant: "outline" })}>
            Cancelar edición
          </Link>
        ) : null}
      </div>
    </form>
  );
}
