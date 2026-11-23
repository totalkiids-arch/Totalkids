import type { DetectedImage } from "./image-bytes.js";

/**
 * Puerto de almacenamiento de las imágenes del catálogo (LN-12). La API valida
 * el archivo y genera el nombre; el adaptador solo guarda bytes y entrega la URL
 * pública que queda en product_images.url.
 *
 * - `LocalDiskImageStorage` (local-disk.ts): carpeta IMAGES_DIR. En desarrollo la
 *   sirve la API en /uploads; en un VPS, el proxy (Caddy/Nginx).
 * - Un adaptador externo (S3, R2, Cloudinary…) implementaría esta misma
 *   interfaz si el hosting final no tiene disco persistente (ver README).
 */
export interface ImageStorage {
  /** Guarda la imagen con un nombre generado por el servidor. */
  save(image: { bytes: Uint8Array; detected: DetectedImage }): Promise<StoredImage>;
  /** Borra la imagen; no falla si ya no existe. */
  delete(key: string): Promise<void>;
  /**
   * Clave interna a partir de la URL guardada, o null si la URL no es de este
   * almacenamiento (p. ej. fotos importadas con URL externa): esas no se borran.
   */
  keyFromUrl(url: string): string | null;
}

export interface StoredImage {
  /** Identificador dentro del almacenamiento ("products/<uuid>.webp"). */
  key: string;
  /** URL pública completa para product_images.url. */
  url: string;
}
