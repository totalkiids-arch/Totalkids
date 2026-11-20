"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Checkbox, TextField } from "@/shared/ui/form";

import { CATEGORY_NAME_MAX } from "../../domain/admin-product";
import { fieldId } from "../../domain/admin-product-form";
import { saveCategoryAction, type CategoryFormState } from "./admin-catalog-actions";

/** Crear o editar una categoría. Al editar, el slug (enlace) no cambia. */
export function CategoryForm({
  editing,
}: {
  editing: { slug: string; name: string; active: boolean } | null;
}) {
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(saveCategoryAction, {
    values: { name: editing?.name ?? "", active: editing?.active ?? true },
    errors: {},
  });
  const summary = Object.entries(state.errors).map(([path, message]) => ({
    fieldId: path === "form" ? undefined : fieldId(path),
    message,
  }));

  return (
    <form action={action} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={editing?.slug ?? ""} />
      <FormErrorSummary errors={summary} />
      <div id={fieldId("name")} className="max-w-xl scroll-mt-24">
        <TextField
          label="Nombre"
          name="name"
          defaultValue={state.values.name}
          maxLength={CATEGORY_NAME_MAX}
          error={state.errors.name}
          hint={
            editing
              ? `Enlace: /catalogo?categoria=${editing.slug} (no cambia al renombrar, para no romper enlaces).`
              : "El enlace se arma con el nombre (p. ej. «Línea JUNJI» → linea-junji). Nombre y enlace deben ser únicos."
          }
        />
      </div>
      <Checkbox name="active" value="1" label="Activa" defaultChecked={state.values.active} />
      <AdminMuted>
        Una categoría inactiva deja de mostrarse en la tienda; sus productos no se borran.
      </AdminMuted>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear categoría"}
        </Button>
        {editing ? (
          <Link href="/admin/categorias" className={buttonClasses({ variant: "outline" })}>
            Cancelar edición
          </Link>
        ) : null}
      </div>
    </form>
  );
}
