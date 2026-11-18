# Total Kids — maqueta web

Maqueta navegable de la tienda y del panel administrativo basada en la SRS v1.1. Contiene **36 páginas**, datos ficticios y acciones locales para presentar los recorridos.

## Abrir la maqueta

Requiere Node.js 18 o superior, sin dependencias que instalar:

```bash
npm run preview
```

- Tienda: http://127.0.0.1:4173
- Todas las pantallas: http://127.0.0.1:4173/pages/mapa.html
- Acceso al panel: http://127.0.0.1:4173/admin/acceso.html
- Resumen administrativo: http://127.0.0.1:4173/admin/index.html

El acceso es una **simulación**: elige Administrador u Operador y escribe cualquier contraseña ficticia de al menos ocho caracteres. No ingreses datos personales reales.

## Qué incluye

Catálogo y recorrido original de compra, pago Flow de demostración y sus resultados, cuenta e historial, recuperación de acceso, solicitudes, suscripción y baja. Panel con pedidos, productos, categorías, inventario, cupones, zonas de despacho, banners, solicitudes, suscriptores, correos, reportes, roles, conciliación e historial de actividad.

Los cambios del panel se guardan en este navegador. En **Todas las pantallas → Restaurar datos de ejemplo** puedes reiniciar la presentación.

Consulta [COBERTURA_SRS.md](COBERTURA_SRS.md) para ver qué faltaba, las rutas, los requisitos representados y las funciones que requieren backend. El panel y la tienda original usan ejemplos independientes. No hay pagos, autenticación, envío de correo ni servicios reales.

## Estructura

```text
index.html                 Inicio de la tienda
pages/                     Compra, servicios y cuenta
admin/                     Panel administrativo
assets/css/panel.css       Estilos de las nuevas pantallas
assets/js/panel.js         Vistas y comportamiento de demostración
assets/                    Fuentes y runtime original
scripts/                   Servidor, validación y extracción original
COBERTURA_SRS.md            Inventario y límites de la entrega
```

## Verificar

```bash
npm run check
```

Comprueba las 36 páginas y sus recursos locales. El archivo empaquetado original se conserva intacto. `npm run extract` regenera las siete pantallas originales y **sobrescribe** el pago Flow y los enlaces agregados a ellas; úsalo solo si quieres recuperar esa versión.
