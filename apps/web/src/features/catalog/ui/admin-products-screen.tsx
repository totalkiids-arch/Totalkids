import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { PaginationNav } from "@/shared/ui/admin/pagination-nav";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { StatusBadge } from "@/shared/ui/admin/status-badge";
import { ButtonLink } from "@/shared/ui/button";
import { SelectField, TextField } from "@/shared/ui/form";
import { PlusIcon } from "@/shared/ui/icons";

import { adminCatalog } from "../container";
import { PRODUCT_STATUS_LABEL, stockStatus, type ProductStatus } from "../domain/admin-product";
import {
  PUBLICATION_FILTERS,
  parseAdminProductQuery,
  toAdminProductSearch,
  type AdminProductQuery,
} from "../domain/admin-product-query";
import { formatClp } from "../domain/product";
import { toggleProductAction } from "./admin/admin-catalog-actions";
import { param, units, type AdminSearchParams } from "./admin/admin-format";

const NOTICES: Record<string, { message: string; tone: "success" | "info" | "warning" }> = {
  creado: { message: "Producto creado.", tone: "success" },
  guardado: {
    message: "Producto guardado. Los pedidos anteriores conservan sus datos.",
    tone: "success",
  },
  activado: {
    message: "Publicación actualizada: el producto está publicado en la tienda.",
    tone: "success",
  },
  borrador: {
    message: "El producto sigue en borrador: nunca se publicó, así que no hay nada que retirar.",
    tone: "info",
  },
  "no-publicable": {
    message:
      "No se pudo publicar: el producto necesita categoría activa, precio en cada variante y al menos una imagen con descripción. Complétalo en Editar.",
    tone: "warning",
  },
  error: {
    message: "No pudimos actualizar la publicación. Intenta de nuevo en unos minutos.",
    tone: "warning",
  },
  desactivado: {
    message:
      "Publicación actualizada: el producto está inactivo y no admite nuevas compras. Los pedidos históricos se conservan.",
    tone: "success",
  },
  "no-existe": { message: "Ese producto ya no existe.", tone: "warning" },
};

const STATUS_TONE: Record<ProductStatus, "green" | "yellow" | "neutral"> = {
  active: "green",
  draft: "yellow",
  inactive: "neutral",
};

const listHref = (query: AdminProductQuery) =>
  `/admin/productos${toAdminProductSearch(query)}` as Route;

/** Panel administrativo · Productos (RF-26). */
export async function AdminProductsScreen({
  searchParams = {},
}: {
  searchParams?: AdminSearchParams;
}) {
  const query = parseAdminProductQuery(searchParams);
  const result = await adminCatalog.listProducts(query);
  const notice = NOTICES[param(searchParams, "aviso")];
  const back = toAdminProductSearch({ ...query, page: result.page });

  return (
    <>
      <AdminPageHeading
        title="Productos"
        description="Organiza los muebles que acompañan cada etapa."
        actions={
          <ButtonLink href="/admin/productos/nuevo">
            <PlusIcon size={18} />
            Nuevo producto
          </ButtonLink>
        }
      />
      {notice ? <LiveNotice message={notice.message} tone={notice.tone} /> : null}

      <FilterBar label="Buscar productos">
        <TextField
          label="Buscar producto"
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="Nombre o SKU"
          className="min-w-0 flex-1 basis-60 sm:max-w-105"
        />
        <SelectField
          label="Publicación"
          name="estado"
          defaultValue={query.status}
          options={PUBLICATION_FILTERS}
        />
      </FilterBar>

      <AdminPanel flush>
        <DataTable
          caption="Productos del catálogo"
          columns={[
            { key: "product", label: "Producto / variante" },
            { key: "price", label: "Precio", align: "end" },
            { key: "available", label: "Disponible", align: "end" },
            { key: "status", label: "Publicación" },
            { key: "actions", label: "Acciones" },
          ]}
          rows={result.items.map((product) => {
            const lowStock = stockStatus(product.available) === "low";
            const published = product.status === "active";
            return {
              key: product.id,
              cells: {
                product: (
                  <CellTitle
                    title={product.name}
                    meta={[
                      `${product.variantCount} variante${product.variantCount === 1 ? "" : "s"}`,
                      product.categoryName,
                    ].join(" · ")}
                  />
                ),
                price: (
                  <>
                    {product.variantCount > 1 && product.price !== null ? (
                      <span className="text-text-secondary">desde </span>
                    ) : null}
                    {product.price === null ? "Por definir" : formatClp(product.price)}
                  </>
                ),
                available: (
                  <span className="inline-flex items-center gap-2">
                    {lowStock ? <StatusBadge tone="yellow">Stock bajo</StatusBadge> : null}
                    {units(product.available)}
                  </span>
                ),
                status: (
                  <StatusBadge tone={STATUS_TONE[product.status]}>
                    {PRODUCT_STATUS_LABEL[product.status]}
                  </StatusBadge>
                ),
                actions: (
                  <span className="flex items-center gap-1">
                    <Link
                      href={`/admin/productos/${product.id}` as Route}
                      className={TEXT_ACTION}
                      aria-label={`Editar ${product.name}`}
                    >
                      Editar
                    </Link>
                    <form action={toggleProductAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <input type="hidden" name="active" value={published ? "0" : "1"} />
                      <input type="hidden" name="volver" value={back} />
                      <button
                        type="submit"
                        className={TEXT_ACTION}
                        aria-label={`${published ? "Retirar" : "Publicar"} ${product.name}`}
                      >
                        {published ? "Retirar" : "Publicar"}
                      </button>
                    </form>
                  </span>
                ),
              },
            };
          })}
          footer={`${result.total} producto${result.total === 1 ? "" : "s"} · página ${result.page} de ${result.pageCount}`}
        />
        <PaginationNav
          label="Páginas de productos"
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(page) => listHref({ ...query, page })}
        />
      </AdminPanel>
      <p className="text-[13px] text-text-secondary">
        Desactivar quita el producto del catálogo y de nuevas compras; no borra el producto ni sus
        pedidos históricos.
      </p>
    </>
  );
}
