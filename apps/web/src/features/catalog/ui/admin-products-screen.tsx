import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { FilterBar } from "@/shared/ui/admin/filter-bar";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { PaginationNav } from "@/shared/ui/admin/pagination-nav";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { ActiveBadge, StatusBadge } from "@/shared/ui/admin/status-badge";
import { ButtonLink } from "@/shared/ui/button";
import { SelectField, TextField } from "@/shared/ui/form";
import { PlusIcon } from "@/shared/ui/icons";

import { adminCatalog } from "../container";
import { inventoryStatus, lowestPrice, totalAvailable } from "../domain/admin-product";
import {
  PUBLICATION_FILTERS,
  parseAdminProductQuery,
  toAdminProductSearch,
  type AdminProductQuery,
} from "../domain/admin-product-query";
import { formatClp } from "../domain/product";
import { toggleProductAction } from "./admin/admin-catalog-actions";
import { DEMO_STORE_NOTE, param, units, type AdminSearchParams } from "./admin/admin-format";

const NOTICES: Record<string, { message: string; tone: "success" | "info" | "warning" }> = {
  creado: { message: "Producto creado.", tone: "success" },
  guardado: {
    message: "Producto guardado. Los pedidos anteriores conservan sus datos.",
    tone: "success",
  },
  "guardado-sin-imagen": {
    message:
      "Producto guardado. La imagen elegida no se guardó: la carga de imágenes todavía no está disponible.",
    tone: "info",
  },
  activado: {
    message:
      "Publicación actualizada: el producto está activo. Los pedidos históricos se conservan.",
    tone: "success",
  },
  desactivado: {
    message:
      "Publicación actualizada: el producto está inactivo y no admite nuevas compras. Los pedidos históricos se conservan.",
    tone: "success",
  },
  "no-existe": { message: "Ese producto ya no existe.", tone: "warning" },
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
  const [result, categories] = await Promise.all([
    adminCatalog.listProducts(query),
    adminCatalog.listCategories(),
  ]);
  const categoryName = new Map(categories.map((c) => [c.slug, c.name]));
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
      <InfoNote>{DEMO_STORE_NOTE}</InfoNote>

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
            const [first, ...rest] = product.variants;
            const lowStock = product.variants.some((v) => inventoryStatus(v) !== "ok");
            return {
              key: product.id,
              cells: {
                product: (
                  <CellTitle
                    title={product.name}
                    meta={[
                      first?.sku,
                      rest.length > 0
                        ? `+${rest.length} variante${rest.length === 1 ? "" : "s"}`
                        : null,
                      categoryName.get(product.category) ?? product.category,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ),
                price: (
                  <>
                    {rest.length > 0 ? <span className="text-text-secondary">desde </span> : null}
                    {formatClp(lowestPrice(product))}
                  </>
                ),
                available: (
                  <span className="inline-flex items-center gap-2">
                    {lowStock ? <StatusBadge tone="yellow">Stock bajo</StatusBadge> : null}
                    {units(totalAvailable(product))}
                  </span>
                ),
                status: <ActiveBadge active={product.active} />,
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
                      <input type="hidden" name="active" value={product.active ? "0" : "1"} />
                      <input type="hidden" name="volver" value={back} />
                      <button
                        type="submit"
                        className={TEXT_ACTION}
                        aria-label={`${product.active ? "Desactivar" : "Activar"} ${product.name}`}
                      >
                        {product.active ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </span>
                ),
              },
            };
          })}
          footer={`${result.total} producto${result.total === 1 ? "" : "s"} · página ${result.page} de ${result.pageCount} · Datos de demostración`}
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
