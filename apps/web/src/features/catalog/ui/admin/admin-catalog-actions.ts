"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { ADMIN_ROLE_LABEL, canAccessSection, type AdminSection } from "@/features/users";

import { adminCatalog } from "../../container";
import type { FieldErrors } from "../../domain/admin-product";
import {
  emptyVariant,
  parseAmount,
  toProductDraft,
  type ProductFormValues,
} from "../../domain/admin-product-form";
import { parseAdminProductQuery, toAdminProductSearch } from "../../domain/admin-product-query";

/*
 * Mutaciones del panel de catálogo. Cada acción:
 * 1. comprueba que la sesión (DEMO, ver features/auth) sea de Administrador:
 *    la pantalla ya lo filtra, pero una acción se puede invocar directamente;
 * 2. valida la forma del formulario con zod;
 * 3. delega en el puerto AdminCatalog, que valida con las reglas del dominio.
 * Los formularios funcionan sin JavaScript (useActionState + redirect).
 */

const MAX_VARIANTS = 30;
const FORBIDDEN = "Tu rol no puede modificar el catálogo. Ingresa como Administrador.";

async function canEdit(section: AdminSection) {
  const session = await getAdminSession();
  return session && canAccessSection(session.role, section) ? session : null;
}

const str = (max: number) => z.string().max(max);
const list = (max: number, items = 40) => z.array(z.string().max(max)).max(items);

// ── Productos ────────────────────────────────────────────────────────────────

export interface ProductFormState {
  values: ProductFormValues;
  errors: FieldErrors;
}

const ProductForm = z
  .object({
    id: str(60),
    intent: str(80),
    name: str(2000),
    category: str(80),
    categories: list(80),
    levels: list(40),
    materials: list(40),
    description: str(20000),
    dimensions: str(2000),
    optionName: str(500),
    variant_id: list(80, MAX_VARIANTS),
    variant_sku: list(500, MAX_VARIANTS),
    variant_option: list(500, MAX_VARIANTS),
    variant_price: list(40, MAX_VARIANTS),
    variant_compare: list(40, MAX_VARIANTS),
    variant_physical: list(40, MAX_VARIANTS),
    assemblyPrice: str(40),
    personalizationPrice: str(40),
    personalizationMaxLength: str(40),
    active: z.boolean(),
    image_alt: list(2000, 20),
    new_image_type: str(120),
    new_image_size: str(40),
    new_image_name: str(300),
    new_image_alt: str(2000),
  })
  .refine((f) =>
    [f.variant_sku, f.variant_option, f.variant_price, f.variant_compare, f.variant_physical].every(
      (column) => column.length === f.variant_id.length,
    ),
  );

function readProductForm(formData: FormData) {
  const one = (name: string) => formData.get(name) ?? "";
  const all = (name: string) => formData.getAll(name);
  return ProductForm.safeParse({
    id: one("id"),
    intent: one("intent") || "save",
    name: one("name"),
    category: one("category"),
    categories: all("categories"),
    levels: all("levels"),
    materials: all("materials"),
    description: one("description"),
    dimensions: one("dimensions"),
    optionName: one("optionName"),
    variant_id: all("variant_id"),
    variant_sku: all("variant_sku"),
    variant_option: all("variant_option"),
    variant_price: all("variant_price"),
    variant_compare: all("variant_compare"),
    variant_physical: all("variant_physical"),
    assemblyPrice: one("assemblyPrice"),
    personalizationPrice: one("personalizationPrice"),
    personalizationMaxLength: one("personalizationMaxLength"),
    active: formData.get("active") === "1",
    image_alt: all("image_alt"),
    new_image_type: one("new_image_type"),
    new_image_size: one("new_image_size"),
    new_image_name: one("new_image_name"),
    new_image_alt: one("new_image_alt"),
  });
}

/**
 * Guarda el producto o, sin salir del formulario, agrega o quita una variante
 * (botones con name="intent"; así también funciona sin JavaScript).
 */
export async function saveProductAction(
  previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  if (!(await canEdit("productos"))) return { ...previous, errors: { form: FORBIDDEN } };

  const parsed = readProductForm(formData);
  if (!parsed.success) {
    return { ...previous, errors: { form: "No pudimos leer el formulario. Recarga la página." } };
  }
  const form = parsed.data;
  const id = form.id || null;
  const current = id ? await adminCatalog.getProduct(id) : null;
  if (id && !current) return { ...previous, errors: { form: "El producto ya no existe." } };

  // Las reservas y las fotos salen del almacén, nunca del formulario.
  const reserved = new Map(current?.variants.map((v) => [v.id, v.reserved]) ?? []);
  const values: ProductFormValues = {
    name: form.name,
    category: form.category,
    categories: form.categories,
    levels: form.levels,
    materials: form.materials,
    description: form.description,
    dimensions: form.dimensions,
    optionName: form.optionName,
    variants: form.variant_id.map((variantId, i) => ({
      id: variantId,
      sku: form.variant_sku[i] ?? "",
      option: form.variant_option[i] ?? "",
      price: form.variant_price[i] ?? "",
      compareAtPrice: form.variant_compare[i] ?? "",
      physical: form.variant_physical[i] ?? "",
      reserved: reserved.get(variantId) ?? 0,
    })),
    assemblyPrice: form.assemblyPrice,
    personalizationPrice: form.personalizationPrice,
    personalizationMaxLength: form.personalizationMaxLength,
    active: form.active,
    images: (current?.images ?? []).map((image, i) => ({
      ...image,
      alt: form.image_alt[i] ?? image.alt,
    })),
    newImage: form.new_image_type
      ? {
          type: form.new_image_type,
          size: form.new_image_size,
          name: form.new_image_name,
          alt: form.new_image_alt,
        }
      : null,
  };

  if (form.intent === "add-variant") {
    if (values.variants.length >= MAX_VARIANTS) {
      return {
        values,
        errors: { variants: `Un producto admite hasta ${MAX_VARIANTS} variantes.` },
      };
    }
    values.variants = [
      ...values.variants,
      emptyVariant(`nueva-${crypto.randomUUID().slice(0, 8)}`),
    ];
    return { values, errors: {} };
  }

  if (form.intent.startsWith("remove-variant:")) {
    const variantId = form.intent.slice("remove-variant:".length);
    const variant = values.variants.find((v) => v.id === variantId);
    if (variant && variant.reserved > 0) {
      return {
        values,
        errors: {
          variants: `La variante ${variant.sku} tiene unidades reservadas y no se puede quitar.`,
        },
      };
    }
    if (values.variants.length <= 1) {
      return { values, errors: { variants: "El producto necesita al menos una variante." } };
    }
    values.variants = values.variants.filter((v) => v.id !== variantId);
    return { values, errors: {} };
  }

  const result = await adminCatalog.saveProduct(id, toProductDraft(values));
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/admin/productos");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/categorias");
  const notice = values.newImage ? "guardado-sin-imagen" : id ? "guardado" : "creado";
  redirect(`/admin/productos?aviso=${notice}`);
}

const ToggleProduct = z.object({
  id: str(60),
  active: z.enum(["0", "1"]),
  volver: str(400),
});

/** Activa o desactiva la publicación desde el listado. Vuelve a la misma búsqueda. */
export async function toggleProductAction(formData: FormData) {
  if (!(await canEdit("productos"))) redirect("/admin");
  const parsed = ToggleProduct.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/productos");

  const product = await adminCatalog.setProductActive(parsed.data.id, parsed.data.active === "1");
  // La búsqueda de vuelta se relee con el parser del dominio: no se redirige a cualquier URL.
  const query = parseAdminProductQuery(Object.fromEntries(new URLSearchParams(parsed.data.volver)));
  const search = new URLSearchParams(toAdminProductSearch(query));
  search.set("aviso", product ? (product.active ? "activado" : "desactivado") : "no-existe");
  revalidatePath("/admin/productos");
  redirect(`/admin/productos?${search.toString()}`);
}

// ── Categorías ───────────────────────────────────────────────────────────────

export interface CategoryFormState {
  values: { name: string; active: boolean };
  errors: FieldErrors;
}

const CategoryForm = z.object({
  slug: str(80),
  name: str(500),
  active: z.boolean(),
});

export async function saveCategoryAction(
  previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  if (!(await canEdit("categorias"))) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = CategoryForm.safeParse({
    slug: formData.get("slug") ?? "",
    name: formData.get("name") ?? "",
    active: formData.get("active") === "1",
  });
  if (!parsed.success) {
    return { ...previous, errors: { form: "No pudimos leer el formulario. Recarga la página." } };
  }
  const values = { name: parsed.data.name, active: parsed.data.active };
  const result = await adminCatalog.saveCategory(parsed.data.slug || null, values);
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/admin/categorias");
  redirect(`/admin/categorias?aviso=${parsed.data.slug ? "guardada" : "creada"}`);
}

const ToggleCategory = z.object({
  slug: str(80),
  active: z.enum(["0", "1"]),
  confirmar: z.enum(["0", "1"]).optional(),
});

/**
 * Activa o desactiva una categoría. Si se desactiva una categoría con
 * productos, primero pide confirmación (segundo paso por URL, sin JavaScript).
 */
export async function toggleCategoryAction(formData: FormData) {
  if (!(await canEdit("categorias"))) redirect("/admin");
  const parsed = ToggleCategory.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/categorias");

  const { slug, active, confirmar } = parsed.data;
  if (active === "0" && confirmar !== "1") {
    const category = (await adminCatalog.listCategories()).find((c) => c.slug === slug);
    if (category && category.productCount > 0) {
      redirect(`/admin/categorias?confirmar=${encodeURIComponent(slug)}#confirmar`);
    }
  }
  const category = await adminCatalog.setCategoryActive(slug, active === "1");
  revalidatePath("/admin/categorias");
  redirect(
    `/admin/categorias?aviso=${category ? (category.active ? "activada" : "desactivada") : "no-existe"}`,
  );
}

// ── Inventario ───────────────────────────────────────────────────────────────

export interface StockFormState {
  values: { sku: string; physical: string; reason: string };
  errors: FieldErrors;
}

const StockForm = z.object({
  sku: str(80),
  physical: str(40),
  reason: str(2000),
});

/** Ajuste de stock físico con motivo; queda registrado con responsable y fecha (RF-34). */
export async function adjustStockAction(
  previous: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  const session = await canEdit("inventario");
  if (!session) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = StockForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ...previous, errors: { form: "No pudimos leer el formulario. Recarga la página." } };
  }
  const values = parsed.data;
  const result = await adminCatalog.adjustStock({
    sku: values.sku,
    physical: parseAmount(values.physical),
    reason: values.reason,
    actor: ADMIN_ROLE_LABEL[session.role],
  });
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/productos");
  redirect(`/admin/inventario?aviso=ajuste&sku=${encodeURIComponent(result.value.sku)}#ajustes`);
}
