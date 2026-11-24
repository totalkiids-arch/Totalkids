import "server-only";

import { serverEnv } from "@/shared/config/server-env";
import { panelGet, panelSend, panelSendForm } from "@/shared/infrastructure/panel-api";
import { businessFieldErrors, isPanelApiError, PanelApiError } from "@/shared/lib/panel-errors";

import type { AdminCatalog, AdminResult, InventoryRow } from "../application/admin-catalog";
import {
  normalizeSku,
  requestedStatus,
  validateCategoryName,
  validateProductDraft,
  validateStockAdjustment,
  type FieldErrors,
} from "../domain/admin-product";
import { toApiProductSearch } from "../domain/admin-product-query";
import {
  productIdOf,
  toAdminProduct,
  toApiProductBody,
  toCategories,
  toCategory,
  toExtraOptions,
  toFormErrors,
  toInventoryActivity,
  toInventoryPage,
  toProductPage,
} from "./admin-catalog-api";

/**
 * Catálogo del panel en la API (LN-12): productos, categorías, extras e
 * inventario. Las reglas del dominio se aplican antes de llamar (mismos
 * mensajes); la API las vuelve a aplicar y además autoriza (solo Administrador).
 *
 * Los errores de negocio (409, 422) vuelven como errores por campo. Lo demás
 * (403, caída) se lanza como PanelApiError y lo muestra la pantalla.
 */

const enc = encodeURIComponent;

const businessErrors = (error: unknown, notFound = "Ya no existe. Recarga la página.") =>
  businessFieldErrors(error, notFound);

const fail = <T>(errors: FieldErrors): AdminResult<T> => ({ ok: false, errors });

async function getProductBody(id: string): Promise<unknown | null> {
  try {
    return await panelGet(`/admin/products/${enc(id)}`);
  } catch (error) {
    // Un id con forma inválida (422) tampoco existe.
    if (
      error instanceof PanelApiError &&
      (error.kind === "not-found" || error.kind === "validation")
    )
      return null;
    throw error;
  }
}

/** Todas las variantes, página por página (la API pagina de a 100). */
async function allInventory(): Promise<InventoryRow[]> {
  const rows: InventoryRow[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = toInventoryPage(await panelGet(`/admin/inventory?page=${page}&pageSize=100`));
    rows.push(...result.rows);
    if (page >= result.totalPages) break;
  }
  return rows;
}

export const apiAdminCatalog: AdminCatalog = {
  async listProducts(query) {
    return toProductPage(await panelGet(`/admin/products?${toApiProductSearch(query)}`));
  },

  async getProduct(id) {
    const body = await getProductBody(id);
    return body === null ? null : toAdminProduct(body, serverEnv.API_URL);
  },

  async listExtraOptions() {
    return toExtraOptions(await panelGet("/admin/extras"));
  },

  async saveProduct(id, draft, image) {
    const [current, categories, extraOptions] = await Promise.all([
      id === null ? Promise.resolve(null) : apiAdminCatalog.getProduct(id),
      apiAdminCatalog.listCategories(),
      apiAdminCatalog.listExtraOptions(),
    ]);
    if (id !== null && !current)
      return { ok: false, errors: { form: "El producto ya no existe." } };

    const allowed = categories
      .filter((c) => c.active || current?.categories.includes(c.id))
      .map((c) => c.id);
    const local = validateProductDraft(draft, {
      currentVariants: current?.variants ?? [],
      allowedCategories: allowed,
      extraOptions,
    });
    if (Object.keys(local).length > 0) return { ok: false, errors: local };

    // Publicar exige una imagen: si viene una nueva, se publica después de subirla.
    const wanted = requestedStatus(draft.publish, current?.status ?? null);
    const deferPublish = wanted === "active" && image !== null && current?.status !== "active";
    const status = deferPublish ? (current?.status ?? "draft") : wanted;

    let productId: string;
    try {
      const body = toApiProductBody(draft, status);
      const response = current
        ? await panelSend(`/admin/products/${enc(current.id)}`, { method: "PATCH", body })
        : await panelSend("/admin/products", { body });
      productId = productIdOf(response.body);
    } catch (error) {
      return { ok: false, errors: toFormErrors(businessErrors(error), draft) };
    }
    const created = current === null;

    // Pasos posteriores: el producto ya está guardado; un error aquí no lo deshace.
    const later = async (): Promise<FieldErrors | null> => {
      for (const [index, image] of (current?.images ?? []).entries()) {
        const alt = draft.imageAlts[index];
        if (alt === undefined || alt === image.alt) continue;
        try {
          await panelSend(`/admin/products/${enc(productId)}/images/${enc(image.id)}`, {
            method: "PATCH",
            body: { alt },
          });
        } catch (error) {
          const errors = businessErrors(error);
          return { [`images.${index}.alt`]: errors.alt ?? errors.form ?? "No se pudo guardar." };
        }
      }
      if (image) {
        const form = new FormData();
        form.set("file", image.file, image.name);
        form.set("alt", image.alt);
        try {
          await panelSendForm(`/admin/products/${enc(productId)}/images`, form);
        } catch (error) {
          if (isPanelApiError(error) && error.status === 413)
            return { newImage: "La imagen pesa más de 2 MB. Usa una más liviana." };
          if (isPanelApiError(error) && error.status === 415)
            return { newImage: "Formato no permitido: usa una imagen JPG, PNG o WebP." };
          const errors = businessErrors(error);
          return {
            ...(errors.file ? { newImage: errors.file } : {}),
            ...(errors.alt ? { "newImage.alt": errors.alt } : {}),
            ...(errors.form ? { newImage: errors.form } : {}),
          };
        }
      }
      if (deferPublish) {
        try {
          await panelSend(`/admin/products/${enc(productId)}`, {
            method: "PATCH",
            body: { status: "active" },
          });
        } catch (error) {
          return toFormErrors(businessErrors(error), draft);
        }
      }
      return null;
    };

    const pending = await later();
    return { ok: true, id: productId, created, pending: pending ? { errors: pending } : null };
  },

  async setProductPublished(id, publish) {
    try {
      if (publish) {
        await panelSend(`/admin/products/${enc(id)}`, {
          method: "PATCH",
          body: { status: "active" },
        });
        return { ok: true, value: "active" };
      }
      // DELETE desactiva (no borra). Un borrador que nunca se publicó sigue igual.
      const current = await getProductBody(id);
      if (current === null) return fail({ form: "Ese producto ya no existe." });
      const product = toAdminProduct(current, serverEnv.API_URL);
      if (product.status === "draft") return { ok: true, value: "draft" };
      await panelSend(`/admin/products/${enc(id)}`, { method: "DELETE" });
      return { ok: true, value: "inactive" };
    } catch (error) {
      return fail(businessErrors(error, "Ese producto ya no existe."));
    }
  },

  async listCategories() {
    return toCategories(await panelGet("/admin/categories"));
  },

  async saveCategory(id, input) {
    const categories = await apiAdminCatalog.listCategories();
    const error = validateCategoryName(input.name, categories, id);
    if (error) return fail({ name: error });
    const body = { name: input.name.trim(), active: input.active };
    try {
      const response = id
        ? await panelSend(`/admin/categories/${enc(id)}`, { method: "PATCH", body })
        : await panelSend("/admin/categories", { body });
      return { ok: true, value: toCategory(response.body) };
    } catch (error) {
      return fail(businessErrors(error, "La categoría ya no existe."));
    }
  },

  async setCategoryActive(id, active) {
    try {
      const response = active
        ? await panelSend(`/admin/categories/${enc(id)}`, { method: "PATCH", body: { active } })
        : await panelSend(`/admin/categories/${enc(id)}`, { method: "DELETE" });
      // DELETE responde { category, … } con el aviso de productos ocultos.
      const body = active ? response.body : (response.body as { category?: unknown }).category;
      return toCategory(body);
    } catch (error) {
      if (isPanelApiError(error) && error.kind === "not-found") return null;
      throw error;
    }
  },

  listInventory: allInventory,

  async adjustStock({ sku, physical, reason }) {
    const key = normalizeSku(sku);
    const row = (await allInventory()).find((r) => normalizeSku(r.sku) === key);
    if (!row) return fail({ sku: "Elige una variante del listado." });

    const errors = validateStockAdjustment({
      physical,
      current: row.physical,
      reserved: row.reserved,
      reason,
    });
    if (Object.keys(errors).length > 0) return fail(errors);
    try {
      await panelSend(`/admin/products/${enc(row.productId)}/stock-adjustments`, {
        body: { variantId: row.variantId, stockPhysical: physical, reason: reason.trim() },
      });
      return { ok: true, value: { sku: row.sku } };
    } catch (error) {
      const api = businessErrors(error, "La variante ya no existe.");
      const { stockPhysical, ...rest } = api;
      return fail(stockPhysical ? { ...rest, physical: stockPhysical } : rest);
    }
  },

  async listInventoryActivity(limit) {
    return toInventoryActivity(
      await panelGet(`/admin/activity?area=inventario&page=1&pageSize=${Math.min(limit, 100)}`),
    );
  },
};
