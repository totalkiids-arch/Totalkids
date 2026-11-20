import type { Route } from "next";
import Link from "next/link";

import { CellTitle, DataTable, TEXT_ACTION } from "@/shared/ui/admin/data-table";
import { InfoNote, LiveNotice } from "@/shared/ui/admin/notice";
import { AdminPageHeading } from "@/shared/ui/admin/page-heading";
import { AdminPanel } from "@/shared/ui/admin/panel";
import { ActiveBadge } from "@/shared/ui/admin/status-badge";
import { Button, ButtonLink, buttonClasses } from "@/shared/ui/button";
import { PlusIcon } from "@/shared/ui/icons";

import { adminCatalog } from "../container";
import { toggleCategoryAction } from "./admin/admin-catalog-actions";
import { DEMO_STORE_NOTE, param, type AdminSearchParams } from "./admin/admin-format";
import { CategoryForm } from "./admin/category-form";

const NOTICES: Record<string, string> = {
  creada: "Categoría creada.",
  guardada: "Categoría guardada.",
  activada: "Categoría activada.",
  desactivada: "Categoría desactivada. Sus productos se conservan.",
  "no-existe": "Esa categoría ya no existe.",
};

const products = (n: number) => `${n} producto${n === 1 ? "" : "s"}`;

/** Panel administrativo · Categorías (RF-26). */
export async function CategoriesScreen({
  searchParams = {},
}: {
  searchParams?: AdminSearchParams;
}) {
  const categories = await adminCatalog.listCategories();
  const editing = categories.find((c) => c.slug === param(searchParams, "editar")) ?? null;
  const confirming = categories.find(
    (c) => c.slug === param(searchParams, "confirmar") && c.active,
  );
  const notice = NOTICES[param(searchParams, "aviso")];

  return (
    <>
      <AdminPageHeading
        title="Categorías"
        description="Ordena los productos del catálogo."
        actions={
          <ButtonLink href={"/admin/categorias#editor" as Route}>
            <PlusIcon size={18} />
            Agregar
          </ButtonLink>
        }
      />
      {notice ? <LiveNotice message={notice} /> : null}
      <InfoNote>{DEMO_STORE_NOTE}</InfoNote>

      {confirming ? (
        <section
          id="confirmar"
          role="alert"
          aria-labelledby="confirmar-titulo"
          className="mb-6 scroll-mt-6 rounded-xl border-2 border-brand-yellow bg-cream p-5"
        >
          <h2 id="confirmar-titulo" className="font-heading text-xl font-extrabold">
            ¿Desactivar «{confirming.name}»?
          </h2>
          <p id="confirmar-texto" className="mt-1.5 text-on-yellow">
            {products(confirming.productCount)} la usan. Seguirán publicados y con sus pedidos, pero
            la categoría dejará de mostrarse en la tienda. Puedes reactivarla cuando quieras.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={toggleCategoryAction}>
              <input type="hidden" name="slug" value={confirming.slug} />
              <input type="hidden" name="active" value="0" />
              <input type="hidden" name="confirmar" value="1" />
              <Button type="submit" variant="danger">
                Sí, desactivar
              </Button>
            </form>
            <Link href="/admin/categorias" className={buttonClasses({ variant: "outline" })}>
              Cancelar
            </Link>
          </div>
        </section>
      ) : null}

      <AdminPanel flush>
        <DataTable
          caption="Categorías del catálogo"
          columns={[
            { key: "name", label: "Nombre" },
            { key: "count", label: "Productos", align: "end" },
            { key: "status", label: "Estado" },
            { key: "actions", label: "Acciones" },
          ]}
          rows={categories.map((category) => ({
            key: category.slug,
            cells: {
              name: <CellTitle title={category.name} meta={category.slug} />,
              count: products(category.productCount),
              status: <ActiveBadge active={category.active} feminine />,
              actions: (
                <span className="flex items-center gap-1">
                  <Link
                    href={
                      `/admin/categorias?editar=${encodeURIComponent(category.slug)}#editor` as Route
                    }
                    className={TEXT_ACTION}
                    aria-label={`Editar ${category.name}`}
                  >
                    Editar
                  </Link>
                  <form action={toggleCategoryAction}>
                    <input type="hidden" name="slug" value={category.slug} />
                    <input type="hidden" name="active" value={category.active ? "0" : "1"} />
                    <button
                      type="submit"
                      className={TEXT_ACTION}
                      aria-label={`${category.active ? "Desactivar" : "Activar"} ${category.name}`}
                    >
                      {category.active ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                </span>
              ),
            },
          }))}
        />
      </AdminPanel>

      <AdminPanel id="editor" title={editing ? `Editar «${editing.name}»` : "Nueva categoría"}>
        {/* key: al cambiar de categoría el formulario parte con sus datos. */}
        <CategoryForm key={editing?.slug ?? "nueva"} editing={editing} />
      </AdminPanel>
    </>
  );
}
