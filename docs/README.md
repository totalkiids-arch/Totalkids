# Documentación del proyecto

| Ruta                                                                                                       | Contenido                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`maqueta/`](maqueta/)                                                                                     | Maqueta navegable aprobada: 36 pantallas de tienda, cuenta y panel. **Referencia de diseño para las tareas UI-01 a UI-14.** |
| [`maqueta/SRS_Total_Kids_v1_1_formato_VetConecta.pdf`](maqueta/SRS_Total_Kids_v1_1_formato_VetConecta.pdf) | SRS v1.1 (requisitos RF/RNF citados en la planificación).                                                                   |
| [`maqueta/COBERTURA_SRS.md`](maqueta/COBERTURA_SRS.md)                                                     | Qué requisito representa cada pantalla de la maqueta y qué necesita backend.                                                |
| [`maqueta/PRODUCT.md`](maqueta/PRODUCT.md)                                                                 | Contexto del producto, usuarios e identidad.                                                                                |

Cómo verificar la tienda, el panel y los pagos, y cómo está armada la base de datos: [`VERIFICACION.md`](VERIFICACION.md).

## Ver la maqueta

```bash
cd docs/maqueta
node scripts/serve.mjs   # http://127.0.0.1:4173 · mapa de pantallas en /pages/mapa.html
```

La maqueta es solo presentación: datos ficticios, sin API ni pagos reales. Las pantallas de producción se implementan en `apps/web` siguiendo `apps/web/ARCHITECTURE.md` y `apps/web/DESIGN.md`; el mapeo maqueta → ruta de Next.js está en el mapa de pantallas de ARCHITECTURE.md.

`total kids.png` es una foto de presentación del logo, no un archivo de producción. Falta el logo ilustrado en SVG o PNG transparente.
