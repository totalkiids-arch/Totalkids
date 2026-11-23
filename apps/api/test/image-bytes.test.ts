import { describe, expect, it } from "vitest";

import { detectImage } from "../src/services/images/image-bytes.js";
import { jpeg, png, webp, webpLossless } from "./image-fixtures.js";

describe("detectImage: formato por bytes iniciales (LN-12)", () => {
  it("reconoce PNG, JPEG y WebP con su tamaño", () => {
    expect(detectImage(png(800, 600))).toMatchObject({
      format: "png",
      extension: "png",
      contentType: "image/png",
      width: 800,
      height: 600,
    });
    expect(detectImage(jpeg(1200, 900))).toMatchObject({
      format: "jpeg",
      extension: "jpg",
      width: 1200,
      height: 900,
    });
    expect(detectImage(webp(640, 480))).toMatchObject({ format: "webp", width: 640, height: 480 });
    expect(detectImage(webpLossless(321, 123))).toMatchObject({
      format: "webp",
      width: 321,
      height: 123,
    });
  });

  it("rechaza lo que no es JPG, PNG ni WebP aunque se llame .png", () => {
    expect(detectImage(Buffer.from("esto es texto, no una foto"))).toBeNull();
    expect(detectImage(Buffer.from("GIF89a\x01\x00\x01\x00"))).toBeNull();
    expect(detectImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImage(new Uint8Array())).toBeNull();
    // RIFF que no es WebP (p. ej. WAV).
    expect(detectImage(Buffer.from("RIFF\x00\x00\x00\x00WAVEfmt "))).toBeNull();
  });

  it("acepta la imagen aunque no pueda leer el tamaño (queda en null, nunca 0)", () => {
    expect(detectImage(png(0, 0))).toMatchObject({ format: "png", width: null, height: null });
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toMatchObject({
      format: "jpeg",
      width: null,
      height: null,
    });
  });
});
