"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAdminSession } from "@/features/auth";
import { canAccessSection, type AdminSection } from "@/features/users";
import { attemptPanel, isPanelFailure } from "@/shared/lib/panel-errors";

import { adminCatalog, STORE_STOCK_TAG } from "../../container";
import { validateImageFile, type FieldErrors } from "../../domain/admin-product";
import {
  emptyVariant,
  NEW_VARIANT_PREFIX,
  parseAmount,
  toProductDraft,
  type ProductFormValues,
} from "../../domain/admin-product-form";
import { parseAdminProductQuery, toAdminProductSearch } from "../../domain/admin-product-query";

/*
 * Mutaciones del panel de catálogo. Cada acción:
 * 1. comprueba que la sesión sea de Administrador: la pantalla ya lo filtra,
 *    pero una acción se puede invocar directamente (y la API vuelve a autorizar);
 * 2. valida la forma del formulario con zod;
 * 3. delega en el puerto AdminCatalog (la API), que aplica las reglas.
 * Una sesión vencida lleva al ingreso; un 403 o la API caída, a un mensaje.
 * Los formularios funcionan sin JavaScript (useActionState + redirect).
 */

const MAX_VARIANTS = 30;
const FORBIDDEN = "Tu rol no puede modificar el catálogo. Ingresa como Administrador.";
const UNREADABLE = "No pudimos leer el formulario. Recarga la página.";

async function canEdit(section: AdminSection) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  return canAccessSection(session.role, section);
}

const str = (max: number) => z.string().max(max);
const list = (max: number, items = 40) => z.array(z.string().max(max)).max(items);

const attempt = attemptPanel;
const failed = isPanelFailure;

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
    extra_code: list(80, 20),
    extra_offered: list(80, 20),
    extra_price: list(40, 20),
    extra_limit: list(40, 20),
    publish: z.boolean(),
    image_alt: list(2000, 40),
    new_image_alt: str(2000),
  })
  .refine(
    (f) =>
      [
        f.variant_sku,
        f.variant_option,
        f.variant_price,
        f.variant_compare,
        f.variant_physical,
      ].every((column) => column.length === f.variant_id.length) &&
      [f.extra_price, f.extra_limit].every((column) => column.length === f.extra_code.length),
  );

function readProductForm(formData: FormData) {
  const one = (name: string) => formData.get(name) ?? "";
  const all = (name: string) => formData.getAll(name).filter((v) => typeof v === "string");
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
    extra_code: all("extra_code"),
    extra_offered: all("extra_offered"),
    extra_price: all("extra_price"),
    extra_limit: all("extra_limit"),
    publish: formData.get("publish") === "1",
    image_alt: all("image_alt"),
    new_image_alt: one("new_image_alt"),
  });
}

/** Archivo de la imagen nueva, si se eligió uno. */
function readImage(formData: FormData): File | null {
  const file = formData.get("new_image");
  return file instanceof File && file.size > 0 ? file : null;
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
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };
  const form = parsed.data;
  const id = form.id || null;

  const loaded = await attempt(() =>
    Promise.all([
      id ? adminCatalog.getProduct(id) : Promise.resolve(null),
      adminCatalog.listExtraOptions(),
    ]),
  );
  if (failed(loaded)) return { ...previous, errors: { form: loaded.failed } };
  const [current, extraOptions] = loaded;
  if (id && !current) return { ...previous, errors: { form: "El producto ya no existe." } };

  // Reservas, stock actual, fotos y estado salen de la API, nunca del formulario.
  const saved = new Map(current?.variants.map((v) => [v.id, v]) ?? []);
  const values: ProductFormValues = {
    name: form.name,
    category: form.category,
    categories: form.categories,
    levels: form.levels,
    materials: form.materials,
    description: form.description,
    dimensions: form.dimensions,
    optionName: form.optionName,
    variants: form.variant_id.map((variantId, i) => {
      const existing = saved.get(variantId);
      return {
        id: variantId,
        sku: form.variant_sku[i] ?? "",
        option: form.variant_option[i] ?? "",
        price: form.variant_price[i] ?? "",
        compareAtPrice: form.variant_compare[i] ?? "",
        // Variante existente: su stock se ajusta en Inventario (el valor enviado se ignora).
        physical: existing ? String(existing.physical) : (form.variant_physical[i] ?? "0"),
        reserved: existing?.reserved ?? 0,
      };
    }),
    extras: extraOptions.map((option) => {
      const index = form.extra_code.indexOf(option.code);
      return {
        code: option.code,
        name: option.name,
        requiresText: option.requiresText,
        offered: form.extra_offered.includes(option.code),
        price: index === -1 ? "" : (form.extra_price[index] ?? ""),
        textMaxLength: index === -1 ? "" : (form.extra_limit[index] ?? ""),
        defaultPrice: option.price,
        defaultTextMaxLength: option.textMaxLength,
      };
    }),
    publish: form.publish,
    status: current?.status ?? null,
    images: (current?.images ?? []).map((image, i) => ({
      ...image,
      alt: form.image_alt[i] ?? image.alt,
    })),
    newImageAlt: form.new_image_alt,
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
      emptyVariant(`${NEW_VARIANT_PREFIX}${crypto.randomUUID().slice(0, 8)}`),
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

  const file = readImage(formData);
  if (file) {
    const fileError = validateImageFile(file);
    if (fileError) return { values, errors: { newImage: fileError } };
  }
  const draft = toProductDraft(values, file ? { type: file.type, size: file.size } : null);
  const result = await attempt(() =>
    adminCatalog.saveProduct(
      id,
      draft,
      file ? { file, name: file.name, alt: draft.newImage?.alt ?? "" } : null,
    ),
  );
  if (failed(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/admin/productos");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/categorias");
  if (result.pending) {
    // Guardado, pero faltó subir la imagen o publicar: se sigue en su ficha.
    const pending = result.pending.errors;
    const step = pending.newImage || pending["newImage.alt"] ? "imagen-pendiente" : "sin-publicar";
    redirect(`/admin/productos/${encodeURIComponent(result.id)}?aviso=${step}`);
  }
  redirect(`/admin/productos?aviso=${result.created ? "creado" : "guardado"}`);
}

const ToggleProduct = z.object({
  id: str(60),
  active: z.enum(["0", "1"]),
  volver: str(400),
});

/** Publica o retira un producto desde el listado. Vuelve a la misma búsqueda. */
export async function toggleProductAction(formData: FormData) {
  if (!(await canEdit("productos"))) redirect("/admin");
  const parsed = ToggleProduct.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/productos");

  const result = await attempt(() =>
    adminCatalog.setProductPublished(parsed.data.id, parsed.data.active === "1"),
  );
  // La búsqueda de vuelta se relee con el parser del dominio: no se redirige a cualquier URL.
  const query = parseAdminProductQuery(Object.fromEntries(new URLSearchParams(parsed.data.volver)));
  const search = new URLSearchParams(toAdminProductSearch(query));
  const notice = failed(result)
    ? "error"
    : !result.ok
      ? result.errors.form === "Ese producto ya no existe."
        ? "no-existe"
        : "no-publicable"
      : { active: "activado", inactive: "desactivado", draft: "borrador" }[result.value];
  search.set("aviso", notice);
  revalidatePath("/admin/productos");
  redirect(`/admin/productos?${search.toString()}`);
}

// ── Categorías ───────────────────────────────────────────────────────────────

export interface CategoryFormState {
  values: { name: string; active: boolean };
  errors: FieldErrors;
}

const CategoryForm = z.object({
  id: str(80),
  name: str(500),
  active: z.boolean(),
});

export async function saveCategoryAction(
  previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  if (!(await canEdit("categorias"))) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = CategoryForm.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    active: formData.get("active") === "1",
  });
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };
  const values = { name: parsed.data.name, active: parsed.data.active };
  const result = await attempt(() => adminCatalog.saveCategory(parsed.data.id || null, values));
  if (failed(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/admin/categorias");
  redirect(`/admin/categorias?aviso=${parsed.data.id ? "guardada" : "creada"}`);
}

const ToggleCategory = z.object({
  id: str(80),
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

  const { id, active, confirmar } = parsed.data;
  if (active === "0" && confirmar !== "1") {
    const categories = await attempt(() => adminCatalog.listCategories());
    if (failed(categories)) redirect("/admin/categorias?aviso=error");
    const category = categories.find((c) => c.id === id);
    if (category && category.productCount > 0) {
      redirect(`/admin/categorias?confirmar=${encodeURIComponent(id)}#confirmar`);
    }
  }
  const category = await attempt(() => adminCatalog.setCategoryActive(id, active === "1"));
  revalidatePath("/admin/categorias");
  const notice = failed(category)
    ? "error"
    : category
      ? category.active
        ? "activada"
        : "desactivada"
      : "no-existe";
  redirect(`/admin/categorias?aviso=${notice}`);
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

/** Ajuste de stock físico con motivo; la API lo registra con responsable y fecha (RF-34). */
export async function adjustStockAction(
  previous: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  if (!(await canEdit("inventario"))) return { ...previous, errors: { form: FORBIDDEN } };
  const parsed = StockForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...previous, errors: { form: UNREADABLE } };
  const values = parsed.data;
  const result = await attempt(() =>
    adminCatalog.adjustStock({
      sku: values.sku,
      physical: parseAmount(values.physical),
      reason: values.reason,
    }),
  );
  if (failed(result)) return { values, errors: { form: result.failed } };
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/productos");
  // El stock decide si la tienda muestra "En stock" o "A pedido".
  updateTag(STORE_STOCK_TAG);
  revalidatePath("/", "layout");
  redirect(`/admin/inventario?aviso=ajuste&sku=${encodeURIComponent(result.value.sku)}#ajustes`);
}
