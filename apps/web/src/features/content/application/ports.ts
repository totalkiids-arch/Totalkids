import type { Banner, BannerInput, FieldErrors } from "../domain/banner";

export type BannerResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

/**
 * Puerto: banners del panel (RF-28). El adaptador valida con las reglas del
 * dominio; con la API (LN-12/LN-13, CRUD /admin/banners), también las aplica
 * el backend. Los banners no se eliminan: se activan o desactivan.
 */
export interface BannerAdmin {
  list(): Promise<Banner[]>;
  /** id null crea un banner nuevo. */
  save(id: string | null, input: BannerInput): Promise<BannerResult<Banner>>;
  /** null si el banner ya no existe. */
  setActive(id: string, active: boolean): Promise<Banner | null>;
}
