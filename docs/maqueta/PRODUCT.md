# Total Kids — contexto del producto

Total Kids presenta una tienda de mobiliario infantil con la identidad «Aprender jugando». La referencia funcional aportada por el usuario es `SRS_Total_Kids_v1_1_formato_VetConecta.pdf`, revisión 1.1 del 17 de noviembre de 2026, pendiente de aprobación.

El objetivo de este repositorio es una **maqueta navegable** para revisar las pantallas del sitio, la cuenta del comprador y el panel administrativo. No constituye el desarrollo del sistema de producción de la SRS.

## Usuarios y recorridos

- Visitante o invitado: explorar muebles, variantes y extras; recorrer carrito, datos de compra, pago Flow simulado y resultados; solicitar servicios y gestionar newsletter.
- Comprador con cuenta: recorrer registro, acceso, recuperación y un historial ficticio de pedidos propios.
- Operador: revisar y gestionar pedidos, pagos de ejemplo, solicitudes y correos; consultar reportes.
- Administrador: lo anterior, más catálogo, inventario, categorías, cupones, despachos, banners, suscriptores y cuentas internas.

## Plataforma y alcance confirmado

Implementación de presentación: páginas HTML independientes, CSS y JavaScript; servidor local Node.js sin dependencias. Se conservan las páginas originales con su runtime React/DC y se añaden pantallas con un módulo compartido. El archivo HTML empaquetado original permanece intacto.

Las nuevas acciones usan datos ficticios persistidos en el navegador y pueden restaurarse desde `pages/mapa.html`. Las nuevas vistas y el recorrido original de compra tienen datos independientes. Contraseñas, pagos, conciliación, correos y permisos son simulaciones explícitas. No introducir datos personales reales.

La moneda de presentación es CLP; el idioma es español. La interfaz se revisa a 360, 768 y 1440 px con teclado y foco visible.

## Identidad existente

Paleta alineada al logo del cliente (`total kids.png`): fuentes locales Nunito y Baloo 2; azul aro #1A5299, tinta #1F2A44, crema #FFF9EE; acentos rojo loro #D0352A, naranja jirafa #F28A1A, amarillo león #FFC21F, verde elefante #5FAE3A (texto #2F7A1F), celeste mono #2E9BD6 y morado oso #8447B0. El logotipo colorea cada letra como el logo. El panel se utiliza para operar y revisar datos: claridad de tablas, estados y formularios antes que decoración.

## Límites de esta entrega

No incluye API, base de datos, autenticación ni autorización reales, callbacks Flow, stock transaccional, procesos durables, envío de correo, almacenamiento remoto ni despliegue. Esas funciones requieren el desarrollo posterior descrito por la SRS. Las políticas definitivas y decisiones comerciales necesitan aprobación del cliente.

El inventario por pantalla, los requisitos representados y las limitaciones detalladas están en `COBERTURA_SRS.md`. La forma de abrir y validar la maqueta está en `README.md`.
