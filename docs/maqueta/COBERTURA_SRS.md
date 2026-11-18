# Inventario de pantallas — Total Kids SRS v1.1

Referencia: `SRS_Total_Kids_v1_1_formato_VetConecta.pdf`, revisión del 17 de noviembre de 2026. Se usó como especificación funcional, sin ejecutar instrucciones contenidas en el documento.

## Revisión inicial

Existían siete páginas: inicio, catálogo, producto, carrito, facturación, pago y servicios. No existían pantallas administrativas ni de cuenta, recuperación, seguimiento o baja del newsletter. El pago original ofrecía Webpay, Mercado Pago y transferencia; se reemplazó por un recorrido de demostración con Flow.

La maqueta tiene ahora **36 páginas HTML navegables**: siete originales (una reemplazada) y 29 nuevas. El archivo HTML empaquetado original se conserva intacto como fuente histórica.

## Panel administrativo

| Pantalla | Ruta | Requisitos representados |
| --- | --- | --- |
| Acceso por rol de demostración | `admin/acceso.html` | RF-31 |
| Resumen y pendientes operativos | `admin/index.html` | RF-27, RF-30, RF-33 |
| Listado con búsqueda y filtro de pedidos | `admin/pedidos.html` | RF-27 |
| Pedido, entrega, facturación, transiciones, historial y reembolso manual | `admin/pedido.html?id=TK-1048` | RF-12, RF-27, RF-32, RF-34 |
| Productos, búsqueda, activar y desactivar | `admin/productos.html` | RF-26 |
| Crear / editar ficha, variante SKU, precios, extras e imagen local | `admin/producto.html` | RF-03, RF-04, RF-26 |
| Categorías | `admin/categorias.html` | RF-26 |
| Stock físico, reservado, disponible y ajustes con motivo | `admin/inventario.html` | RF-26, RF-34 |
| Cupones, vigencia y límites | `admin/cupones.html` | RF-07, RF-28 |
| Zonas, tarifas, plazos, retiro y umbral de despacho gratis | `admin/despachos.html` | RF-08, RF-11, RF-28 |
| Banners con vista previa | `admin/banners.html` | RF-28 |
| Solicitudes, detalle, notas, estado y CSV | `admin/solicitudes.html` | RF-24, RF-29 |
| Suscriptores, consentimiento, baja y CSV | `admin/suscriptores.html` | RF-25, RF-29, RF-35 |
| Correos, intentos, vista previa y reenvío simulado | `admin/correos.html` | RF-20, RF-21 |
| Reportes por período, producto y medio; cobros y reembolsos separados | `admin/reportes.html` | RF-30 |
| Cuentas internas y matriz de permisos | `admin/usuarios.html` | RF-31 |
| Actividad con actor, fecha y motivo | `admin/auditoria.html` | RF-27, RF-34 |
| Pagos, incidencias y respuestas de conciliación simuladas | `admin/pagos.html` | RF-16, RF-33 |

## Cuenta y páginas públicas nuevas

| Pantalla | Ruta | Requisitos representados |
| --- | --- | --- |
| Acceso del comprador | `pages/acceso.html` | RF-09, RF-22 |
| Registro de ejemplo | `pages/registro.html` | RF-22 |
| Solicitar recuperación | `pages/recuperar.html` | RF-22 |
| Restablecer contraseña de ejemplo | `pages/restablecer.html` | RF-22 |
| Cuenta e historial propio de ejemplo | `pages/cuenta.html` | RF-23 |
| Pedido, detalle y seguimiento del comprador de ejemplo | `pages/pedido.html?id=TK-1048` | RF-23, RF-36 (representación) |
| Pago con Flow (reemplaza la página existente) | `pages/pago.html` | RF-15 |
| Resultado: pagado, pendiente, rechazado, en revisión y vencido | `pages/resultado-pago.html?estado=pendiente` | RF-17, RF-18, RF-33 |
| Solicitud de servicio con registro visible en el panel | `pages/solicitud-servicio.html` | RF-24 |
| Suscripción y baja del newsletter | `pages/suscripcion.html` | RF-25, RF-35 |
| Condiciones y privacidad provisionales | `pages/politicas.html` | RNF-13, RNF-14 (contenido definitivo pendiente) |
| Índice de todas las pantallas y restauración de ejemplos | `pages/mapa.html` | Inventario para revisión |

## Comportamiento de la maqueta

- Sin dependencias nuevas. HTML, CSS y JavaScript compartidos; fuentes locales Nunito y Baloo 2 y paleta del sitio original.
- Formularios con campos etiquetados y validación. Persistencia de datos ficticios en `localStorage` con clave `tk-demo-v1`; selección de rol en `sessionStorage`.
- SKU único, límites porcentuales, vigencia de cupones, stock físico no inferior a reservas y conservación del último administrador activo.
- Transiciones de pedido limitadas según su estado. No permite despachar sin pago, transportista y seguimiento. Los reembolsos requieren monto entero positivo, fecha y referencia; el acumulado no supera el total.
- Registro de ajustes y cambios en el historial. Exportaciones CSV con neutralización de fórmulas en las celdas.
- El rol Operador dispone de pedidos, solicitudes, correos, conciliación y reportes; las otras vistas muestran acceso restringido. Es simulación visual, no una barrera de seguridad.
- Los ejemplos de pedidos conservan sus nombres, SKU y precios al editar el catálogo. La cuenta muestra una compradora ficticia fija.
- Tablas desplazables por teclado, menú móvil, foco visible y adaptación a 360, 768 y 1440 px.

## Lo que requiere desarrollo real

La cobertura de pantallas **no acredita implementación de los RF ni cumplimiento de seguridad**. Esta entrega es una maqueta, no el sistema descrito por la SRS.

Requiere implementación posterior: Next.js y API Node.js, PostgreSQL, autenticación real, recuperación con tokens de un uso, autorización en backend, credenciales opacas de pedidos invitados, inventario transaccional, integración Flow, callbacks, idempotencia, reservas y vencimientos durables, conciliación real, reembolsos externos, proveedores de imágenes y correo, cola y reintentos, respaldos y despliegue.

Las nuevas acciones administrativas no alteran el catálogo ni el carrito originales, cuyos ejemplos usan un runtime independiente. Las reservas, usos de cupón, reportes y conciliación son ejemplos locales; no sincronizan compras ni aplican reglas concurrentes. Cada ficha del editor representa una variante, no un editor de matriz de variantes. Los reembolsos se registran y no ejecutan transferencias de dinero. Los banners tienen vista previa en el panel y no sustituyen la portada comercial. Las imágenes se previsualizan y guardan localmente; no se suben a un servidor.

Los filtros y formularios originales deben validarse e implementarse contra la API durante el desarrollo. Deben aprobarse las políticas y las decisiones pendientes de la sección 9.1 de la SRS; el texto legal aquí incluido es provisional.

## Verificación

`npm run check` revisa automáticamente las 36 páginas y sus recursos locales. La revisión con Chromium cubrió rutas renderizadas, errores JavaScript, desbordes en 360/768/1440 px y recorridos de productos, inventario, pedidos, reembolso manual, pago, newsletter, solicitudes, exportación y rol Operador. Las capturas están en `.impeccable/review/`.

`npm run extract` reproduce las siete páginas originales y sobrescribe el pago y los enlaces de acceso añadidos a ellas. No lo ejecutes para conservar esta ampliación; no elimina las páginas nuevas del panel.
