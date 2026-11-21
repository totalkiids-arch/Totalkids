"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted } from "@/shared/ui/admin/panel";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Checkbox, RadioGroup, TextField } from "@/shared/ui/form";

import { ADMIN_ROLE_LABEL, ADMIN_ROLES } from "../domain/admin-role";
import { NAME_MAX, type InternalUser } from "../domain/internal-user";
import type { SaveUserAction, UserFormState } from "./user-form-handlers";

const ROLE_OPTIONS = ADMIN_ROLES.map((role) => ({
  value: role,
  label: ADMIN_ROLE_LABEL[role],
  description:
    role === "admin"
      ? "Todo el panel: catálogo, configuración, usuarios y exportaciones."
      : "Pedidos, pagos, solicitudes, correos y reportes.",
}));

const fieldId = (name: string) => `campo-${name}`;

/** Crear o editar una cuenta interna. */
export function UserForm({
  editing,
  action: saveAction,
}: {
  editing: InternalUser | null;
  action: SaveUserAction;
}) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(saveAction, {
    values: {
      name: editing?.name ?? "",
      email: editing?.email ?? "",
      role: editing?.role ?? "operator",
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
        <div id={fieldId("name")} className="scroll-mt-24">
          <TextField
            label="Nombre"
            name="name"
            autoComplete="off"
            defaultValue={state.values.name}
            maxLength={NAME_MAX + 10}
            error={state.errors.name}
            required
          />
        </div>
        <div id={fieldId("email")} className="scroll-mt-24">
          <TextField
            label="Correo"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={state.values.email}
            maxLength={254}
            error={state.errors.email}
            hint="Único entre las cuentas del panel."
            required
          />
        </div>
      </div>
      <div id={fieldId("role")} className="scroll-mt-24">
        <RadioGroup
          legend="Rol"
          name="role"
          variant="cards"
          options={ROLE_OPTIONS}
          defaultValue={state.values.role}
          error={state.errors.role}
          required
        />
      </div>
      <Checkbox
        name="active"
        value="1"
        label="Cuenta activa"
        defaultChecked={state.values.active}
      />
      <AdminMuted>
        Crear una cuenta aquí solo agrega un registro de ejemplo: no se envían invitaciones ni se
        crean contraseñas. Siempre debe quedar al menos un Administrador activo.
      </AdminMuted>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar usuario"}
        </Button>
        {editing ? (
          <Link href="/admin/usuarios" className={buttonClasses({ variant: "outline" })}>
            Cancelar edición
          </Link>
        ) : null}
      </div>
    </form>
  );
}
