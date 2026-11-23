import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import express, { type RequestHandler } from "express";

import type { DetectedImage } from "./image-bytes.js";
import type { ImageStorage, StoredImage } from "./storage.js";

/** Claves que genera este adaptador: nada del cliente llega a la ruta del archivo. */
const KEY_PATTERN = /^products\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Adaptador de disco local (LN-12). Guarda en `<dir>/products/<uuid>.<ext>` y
 * arma la URL con `publicUrl` (IMAGES_PUBLIC_URL). En desarrollo la API sirve la
 * carpeta con `staticHandler()`; en un VPS la sirve el proxy.
 */
export class LocalDiskImageStorage implements ImageStorage {
  readonly dir: string;
  private readonly publicUrl: string;

  constructor(dir: string, publicUrl: string) {
    this.dir = path.resolve(dir);
    this.publicUrl = publicUrl.replace(/\/+$/, "");
  }

  async save({
    bytes,
    detected,
  }: {
    bytes: Uint8Array;
    detected: DetectedImage;
  }): Promise<StoredImage> {
    const key = `products/${randomUUID()}.${detected.extension}`;
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    // "wx": nunca sobrescribe un archivo existente.
    await writeFile(file, bytes, { flag: "wx" });
    return { key, url: `${this.publicUrl}/${key}` };
  }

  async delete(key: string): Promise<void> {
    if (!KEY_PATTERN.test(key)) return;
    await rm(this.pathOf(key), { force: true });
  }

  keyFromUrl(url: string): string | null {
    const prefix = `${this.publicUrl}/`;
    if (!url.startsWith(prefix)) return null;
    const key = url.slice(prefix.length);
    return KEY_PATTERN.test(key) ? key : null;
  }

  /**
   * Sirve la carpeta (solo fuera de producción). `cross-origin` permite que la
   * tienda en :3000 muestre las fotos (helmet pone same-origin por defecto).
   */
  staticHandler(): RequestHandler {
    return express.static(this.dir, {
      index: false,
      dotfiles: "deny",
      redirect: false,
      maxAge: "1h",
      setHeaders: (res) => {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    });
  }

  private pathOf(key: string): string {
    return path.join(this.dir, ...key.split("/"));
  }
}
