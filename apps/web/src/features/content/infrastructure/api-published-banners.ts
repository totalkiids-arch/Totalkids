import "server-only";

import { randomUUID } from "node:crypto";

import { apiFetch } from "@/shared/infrastructure/api-client";

import type { PublishedBanners } from "../application/ports";
import { toStoreBanners } from "./banners-api";

/**
 * Banners de la portada desde la API pública (GET /banners, sin sesión).
 * Se guardan 60 s con la etiqueta STORE_BANNERS_TAG, que el panel invalida al
 * crear, editar, activar o desactivar un banner. Si la API no responde, la
 * portada se muestra sin banners.
 */
export const STORE_BANNERS_TAG = "tienda-banners";

export const apiPublishedBanners: PublishedBanners = {
  async list() {
    try {
      const response = await apiFetch("/api/v1/banners", {
        requestId: randomUUID(),
        timeoutMs: 2000,
        cache: "force-cache",
        next: { revalidate: 60, tags: [STORE_BANNERS_TAG] },
      });
      if (!response.ok) return [];
      return toStoreBanners(await response.json());
    } catch {
      return [];
    }
  },
};
