"use client";

import Link from "next/link";
import { useActionState } from "react";

import { chileLocalInput } from "@/shared/lib/chile-time";
import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Checkbox, TextareaField, TextField } from "@/shared/ui/form";

import { HREF_MAX, ORDER_MAX, ORDER_MIN, TEXT_MAX, TITLE_MAX, type Banner } from "../domain/banner";
import { saveBannerAction, type BannerFormState } from "./banner-actions";

const fieldId = (name: string) => `campo-${name}`;

/** Crear o editar un banner. */
export function BannerForm({ editing, nextOrder }: { editing: Banner | null; nextOrder: number }) {
  const [state, action, pending] = useActionState<BannerFormState, FormData>(saveBannerAction, {
    values: {
      title: editing?.title ?? "",
      text: editing?.text ?? "",
      href: editing?.href ?? "/catalogo",
      order: String(editing?.order ?? nextOrder),
      active: editing?.active ?? true,
      startsAt: editing?.startsAt ? chileLocalInput(editing.startsAt) : "",
      endsAt: editing?.endsAt ? chileLocalInput(editing.endsAt) : "",
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
      <div id={fieldId("title")} className="scroll-mt-24">
        <TextField
          label="Título"
          name="title"
          defaultValue={state.values.title}
          maxLength={TITLE_MAX}
          error={state.errors.title}
          hint={`Hasta ${TITLE_MAX} caracteres.`}
          required
        />
      </div>
      <div id={fieldId("text")} className="scroll-mt-24">
        <TextareaField
          label="Texto de apoyo"
          name="text"
          rows={2}
          defaultValue={state.values.text}
          maxLength={TEXT_MAX}
          error={state.errors.text}
          hint={`Hasta ${TEXT_MAX} caracteres.`}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div id={fieldId("href")} className="scroll-mt-24">
          <TextField
            label="Destino interno"
            name="href"
            defaultValue={state.values.href}
            maxLength={HREF_MAX}
            error={state.errors.href}
            hint="Una página de la tienda que empiece con «/», p. ej. /catalogo o /servicios. No se permiten enlaces externos."
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>
        <div id={fieldId("order")} className="scroll-mt-24">
          <TextField
            label="Orden"
            name="order"
            inputMode="numeric"
            defaultValue={state.values.order}
            error={state.errors.order}
            hint={`De ${ORDER_MIN} a ${ORDER_MAX}; 1 aparece primero.`}
            required
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div id={fieldId("startsAt")} className="scroll-mt-24">
          <TextField
            label="Mostrar desde (opcional)"
            name="startsAt"
            type="datetime-local"
            defaultValue={state.values.startsAt}
            error={state.errors.startsAt}
            hint="Hora de Chile. Vacío: desde ya."
          />
        </div>
        <div id={fieldId("endsAt")} className="scroll-mt-24">
          <TextField
            label="Mostrar hasta (opcional)"
            name="endsAt"
            type="datetime-local"
            defaultValue={state.values.endsAt}
            error={state.errors.endsAt}
            hint="Hora de Chile. Vacío: sin término."
          />
        </div>
      </div>
      <Checkbox name="active" value="1" label="Activo" defaultChecked={state.values.active} />
      <AdminMuted>
        La portada muestra los banners activos cuya ventana incluye este momento, en el orden
        indicado.
      </AdminMuted>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear banner"}
        </Button>
        {editing ? (
          <Link href="/admin/banners" className={buttonClasses({ variant: "outline" })}>
            Cancelar edición
          </Link>
        ) : null}
      </div>
    </form>
  );
}
