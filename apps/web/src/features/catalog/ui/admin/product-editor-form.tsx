"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";

import { FormErrorSummary } from "@/shared/ui/admin/notice";
import { AdminMuted, AdminPanel } from "@/shared/ui/admin/panel";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Checkbox, SelectField, TextareaField, TextField } from "@/shared/ui/form";
import { PlusIcon, TrashIcon } from "@/shared/ui/icons";

import { PRODUCT_NAME_MAX, availableStock } from "../../domain/admin-product";
import { fieldId, type ProductFormValues } from "../../domain/admin-product-form";
import { LEVELS, MATERIALS } from "../../domain/product";
import { saveProductAction, type ProductFormState } from "./admin-catalog-actions";
import { ImagePicker } from "./image-picker";

const NUMERIC = { inputMode: "numeric", autoComplete: "off" } as const;

/** Contenedor con el id del campo, para que el resumen de errores lleve hasta él. */
function Slot({
  path,
  className = "",
  children,
}: {
  path: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div id={fieldId(path)} className={`min-w-0 scroll-mt-24 ${className}`}>
      {children}
    </div>
  );
}

function CheckboxGroup({
  legend,
  hint,
  error,
  name,
  options,
  checked,
}: {
  legend: string;
  hint?: string;
  error?: string;
  name: string;
  options: readonly { value: string; label: string }[];
  checked: readonly string[];
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1" aria-invalid={error ? true : undefined}>
      <legend className="mb-1 text-sm font-extrabold">{legend}</legend>
      {hint ? <AdminMuted>{hint}</AdminMuted> : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4">
        {options.map((option) => (
          <Checkbox
            key={option.value}
            name={name}
            value={option.value}
            label={option.label}
            defaultChecked={checked.includes(option.value)}
          />
        ))}
      </div>
      {error ? <p className="text-sm font-bold text-brand-red">{error}</p> : null}
    </fieldset>
  );
}

/** Formulario de producto. Funciona sin JavaScript: todo se valida y resuelve en el servidor. */
export function ProductEditorForm({
  productId,
  initial,
  categories,
}: {
  productId: string;
  initial: ProductFormValues;
  categories: readonly { slug: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProductAction, {
    values: initial,
    errors: {},
  });
  const { values, errors } = state;
  const multiple = values.variants.length > 1;
  const summary = Object.entries(errors).map(([path, message]) => ({
    fieldId: path === "form" ? undefined : fieldId(path),
    message,
  }));

  return (
    <form action={action} noValidate aria-busy={pending}>
      {/* Enter en un campo guarda (el primer botón de envío del formulario es el predeterminado). */}
      <button
        type="submit"
        name="intent"
        value="save"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      >
        Guardar producto
      </button>
      <input type="hidden" name="id" value={productId} />

      <FormErrorSummary errors={summary} />

      <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
        <div className="min-w-0">
          <AdminPanel title="Información del mueble">
            <div className="flex flex-col gap-4">
              <Slot path="name">
                <TextField
                  label="Nombre del producto"
                  name="name"
                  defaultValue={values.name}
                  maxLength={PRODUCT_NAME_MAX}
                  error={errors.name}
                  hint={`Hasta ${PRODUCT_NAME_MAX} caracteres.`}
                />
              </Slot>
              <Slot path="category">
                <SelectField
                  label="Categoría principal"
                  name="category"
                  defaultValue={values.category}
                  options={categories.map((c) => ({ value: c.slug, label: c.name }))}
                  error={errors.category}
                />
              </Slot>
              <Slot path="categories">
                <CheckboxGroup
                  legend="También aparece en"
                  hint="Opcional. La categoría principal se incluye siempre."
                  name="categories"
                  options={categories.map((c) => ({ value: c.slug, label: c.name }))}
                  checked={values.categories}
                  error={errors.categories}
                />
              </Slot>
              <Slot path="description">
                <TextareaField
                  label="Descripción"
                  name="description"
                  defaultValue={values.description}
                  rows={5}
                  error={errors.description}
                />
              </Slot>
              <Slot path="dimensions">
                <TextField
                  label="Medidas (ancho × fondo × alto)"
                  name="dimensions"
                  defaultValue={values.dimensions}
                  hint="Opcional. Ej.: Ancho 1,0 m · Fondo 40 cm · Alto 50 cm."
                  error={errors.dimensions}
                />
              </Slot>
              <CheckboxGroup
                legend="Material"
                name="materials"
                options={MATERIALS.map((m) => ({ value: m.slug, label: m.label }))}
                checked={values.materials}
              />
              <CheckboxGroup
                legend="Nivel recomendado"
                hint="Filtra el catálogo por nivel. Sin nivel, el producto solo aparece sin ese filtro."
                name="levels"
                options={LEVELS.map((l) => ({ value: l.id, label: `${l.label} (${l.detail})` }))}
                checked={values.levels}
              />
            </div>
          </AdminPanel>

          <AdminPanel
            title="Variantes e inventario"
            description="Cada variante tiene SKU único, precio y stock propios. Disponible = físico − reservado."
          >
            <Slot path="variants" className="flex flex-col gap-4">
              {errors.variants ? (
                <p className="text-sm font-bold text-brand-red">{errors.variants}</p>
              ) : null}
              {multiple ? (
                <Slot path="optionName">
                  <TextField
                    label="Qué se elige entre variantes"
                    name="optionName"
                    defaultValue={values.optionName}
                    placeholder="Tamaño, Color…"
                    error={errors.optionName}
                  />
                </Slot>
              ) : (
                <input type="hidden" name="optionName" value="" />
              )}
              {values.variants.map((variant, index) => {
                const at = (field: string) => `variants.${index}.${field}`;
                const removable = multiple && variant.reserved === 0;
                return (
                  <fieldset
                    key={variant.id}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background/50 p-4"
                  >
                    <legend className="px-1 text-sm font-extrabold">
                      Variante {index + 1}
                      {variant.option ? ` · ${variant.option}` : ""}
                    </legend>
                    <input type="hidden" name="variant_id" value={variant.id} />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <Slot path={at("sku")}>
                        <TextField
                          label="SKU único"
                          name="variant_sku"
                          defaultValue={variant.sku}
                          autoComplete="off"
                          error={errors[at("sku")]}
                        />
                      </Slot>
                      {multiple ? (
                        <Slot path={at("option")}>
                          <TextField
                            label="Opción"
                            name="variant_option"
                            defaultValue={variant.option}
                            placeholder="1 plaza, Azul…"
                            error={errors[at("option")]}
                          />
                        </Slot>
                      ) : (
                        <input type="hidden" name="variant_option" value="" />
                      )}
                      <Slot path={at("price")}>
                        <TextField
                          label="Precio CLP"
                          name="variant_price"
                          defaultValue={variant.price}
                          hint="Entero, sin puntos."
                          error={errors[at("price")]}
                          {...NUMERIC}
                        />
                      </Slot>
                      <Slot path={at("compareAtPrice")}>
                        <TextField
                          label="Precio anterior CLP"
                          name="variant_compare"
                          defaultValue={variant.compareAtPrice}
                          hint="Opcional (oferta). Vacío o 0 = sin precio anterior."
                          error={errors[at("compareAtPrice")]}
                          {...NUMERIC}
                        />
                      </Slot>
                      <Slot path={at("physical")}>
                        <TextField
                          label="Stock físico"
                          name="variant_physical"
                          defaultValue={variant.physical}
                          hint={`${variant.reserved} reservada${variant.reserved === 1 ? "" : "s"}: el físico no puede ser menor.`}
                          error={errors[at("physical")]}
                          {...NUMERIC}
                        />
                      </Slot>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <AdminMuted>
                        Reservado: {variant.reserved} · Disponible actual:{" "}
                        {availableStock({
                          physical: Number(variant.physical) || 0,
                          reserved: variant.reserved,
                        })}{" "}
                        un.
                      </AdminMuted>
                      {multiple ? (
                        <Button
                          type="submit"
                          name="intent"
                          value={`remove-variant:${variant.id}`}
                          variant="ghost"
                          disabled={!removable}
                          aria-label={`Quitar variante ${index + 1}${variant.sku ? ` (${variant.sku})` : ""}`}
                          className="min-h-11 px-3 text-sm"
                        >
                          <TrashIcon size={18} />
                          Quitar
                        </Button>
                      ) : null}
                    </div>
                    {multiple && !removable ? (
                      <AdminMuted>Tiene unidades reservadas: no se puede quitar.</AdminMuted>
                    ) : null}
                  </fieldset>
                );
              })}
              <Button
                type="submit"
                name="intent"
                value="add-variant"
                variant="outline"
                className="self-start"
              >
                <PlusIcon size={18} />
                Agregar variante
              </Button>
            </Slot>
          </AdminPanel>

          <AdminPanel
            title="Extras compatibles"
            description="0 = el extra no está disponible para este producto."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Slot path="assemblyPrice">
                <TextField
                  label="Armado CLP"
                  name="assemblyPrice"
                  defaultValue={values.assemblyPrice}
                  error={errors.assemblyPrice}
                  {...NUMERIC}
                />
              </Slot>
              <Slot path="personalizationPrice">
                <TextField
                  label="Personalización CLP"
                  name="personalizationPrice"
                  defaultValue={values.personalizationPrice}
                  error={errors.personalizationPrice}
                  {...NUMERIC}
                />
              </Slot>
              <Slot path="personalizationMaxLength">
                <TextField
                  label="Límite de caracteres del nombre"
                  name="personalizationMaxLength"
                  defaultValue={values.personalizationMaxLength}
                  hint="Entre 1 y 100."
                  error={errors.personalizationMaxLength}
                  {...NUMERIC}
                />
              </Slot>
            </div>
          </AdminPanel>
        </div>

        <div className="min-w-0">
          <AdminPanel title="Publicación">
            <Checkbox
              name="active"
              value="1"
              label="Visible en el catálogo"
              defaultChecked={values.active}
              description="Desactivar conserva el producto y sus pedidos históricos; solo impide nuevas compras."
            />
          </AdminPanel>

          <AdminPanel title="Imágenes">
            <ImagePicker
              images={values.images}
              newImageAlt={values.newImage?.alt ?? ""}
              errors={errors}
            />
          </AdminPanel>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="save" disabled={pending}>
          {pending ? "Guardando…" : "Guardar producto"}
        </Button>
        <Link href="/admin/productos" className={buttonClasses({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
