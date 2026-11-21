import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Tito } from "@/shared/ui/brand/tito";
import { Button, ButtonLink } from "@/shared/ui/button";
import { Checkbox, RadioGroup, SelectField, TextareaField, TextField } from "@/shared/ui/form";
import { ArrowRightIcon } from "@/shared/ui/icons";

import { ModalDemo } from "./modal-demo";

export const metadata: Metadata = {
  title: "Componentes",
  robots: { index: false, follow: false },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[28px] bg-surface p-6 shadow-[0_2px_0_var(--color-border)]">
      <h2 className="text-2xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Galería de componentes de UI-01 para el equipo. Solo existe en desarrollo:
 * en producción responde 404.
 */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex items-center gap-4">
        <Tito className="w-16" />
        <div>
          <h1 className="text-4xl font-extrabold">Componentes</h1>
          <p className="text-text-secondary">
            Piezas de <code>src/shared/ui</code>. Ver reglas de uso en DESIGN.md.
          </p>
        </div>
      </header>

      <Section title="Botones">
        <div className="flex flex-wrap gap-3">
          <Button>Primario</Button>
          <Button variant="danger">Peligro</Button>
          <Button variant="light">Claro</Button>
          <Button variant="dark">Oscuro</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button disabled>Deshabilitado</Button>
          <ButtonLink href="/catalogo" size="lg">
            Enlace grande
            <ArrowRightIcon size={20} />
          </ButtonLink>
        </div>
      </Section>

      <Section title="Campos de texto">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nombre"
            name="nombre"
            autoComplete="name"
            placeholder="Camila González"
          />
          <TextField
            label="RUT"
            name="rut"
            hint="Sin puntos y con guion, por ejemplo 12345678-5."
            defaultValue="12.345.678-0"
            error="El dígito verificador no corresponde a este RUT."
          />
          <TextField
            label="Correo"
            name="correo"
            type="email"
            shape="pill"
            placeholder="nombre@correo.cl"
          />
          <TextField label="Deshabilitado" name="x" disabled defaultValue="No editable" />
        </div>
        <TextareaField
          label="Cuéntanos tu proyecto"
          name="mensaje"
          hint="Medidas del espacio, cantidad de niños y plazos."
        />
      </Section>

      <Section title="Selección">
        <SelectField
          label="Región"
          name="region"
          options={[
            { value: "rm", label: "Metropolitana" },
            { value: "v", label: "Valparaíso" },
            { value: "viii", label: "Biobío" },
          ]}
        />
        <RadioGroup
          legend="¿Cómo quieres recibir tu pedido?"
          name="entrega"
          variant="cards"
          defaultValue="despacho"
          options={[
            {
              value: "despacho",
              label: "Despacho a coordinar",
              description: "Llega en [TUS PLAZOS].",
            },
            {
              value: "retiro",
              label: "Retiro en taller",
              description: "Sin costo. Te avisamos cuando esté listo.",
            },
          ]}
        />
        <RadioGroup
          legend="Documento"
          name="documento"
          defaultValue="boleta"
          options={[
            { value: "boleta", label: "Boleta" },
            {
              value: "factura",
              label: "Factura",
              description: "Necesitarás el RUT y giro de la empresa.",
            },
          ]}
        />
        <Checkbox
          name="novedades"
          label="Quiero recibir novedades por correo"
          description="Puedes darte de baja cuando quieras."
        />
      </Section>

      <Section title="Modal">
        <ModalDemo />
      </Section>
    </main>
  );
}
