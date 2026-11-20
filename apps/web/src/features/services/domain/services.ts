/**
 * Servicios especiales que ofrece Total Kids (RF-24). Dominio puro.
 *
 * El id es estable: viaja en la URL (`/servicios/solicitar?servicio=armado`) y
 * queda guardado en la solicitud. Los precios entre corchetes son marcadores de
 * la maqueta: los define el cliente (CL-02).
 */
export const SERVICES = [
  {
    id: "armado",
    title: "Armado e instalación",
    description: "Llevamos tus muebles, los armamos y fijamos a la pared para mayor seguridad.",
    points: ["Anclaje antivuelco incluido", "Retiro de embalajes"],
    price: "Desde $[PRECIO]",
  },
  {
    id: "diseno",
    title: "Diseño de espacios",
    description: "Proyectamos dormitorios y salas de juego Montessori a la medida de tu hogar.",
    points: ["Plano y propuesta de colores", "Lista de muebles por edad"],
    price: "Desde $[PRECIO]",
  },
  {
    id: "personalizacion",
    title: "Personalización",
    description: "Nombres grabados, letras de colores y combinaciones únicas para cada niño.",
    points: ["Grabado en techos y cabeceras", "Paleta de colores a elección"],
    price: "Desde $[PRECIO]",
  },
  {
    id: "instituciones",
    title: "Jardines y colegios",
    description: "Equipamiento completo de salas: mesas grupales, sillas apilables y casilleros.",
    points: ["Cotización formal con factura", "Visita técnica"],
    price: "Cotización a medida",
  },
  {
    id: "regalos",
    title: "Lista de regalos y Gift Card",
    description: "Arma tu lista para baby shower o cumpleaños y deja que la familia elija.",
    points: ["Link para compartir", "Gift Card digital"],
    price: "Sin costo",
  },
  {
    id: "garantia",
    title: "Garantía y mantención",
    description: "Revisamos, ajustamos y renovamos piezas para que tus muebles crezcan con ellos.",
    points: ["Ajuste de alturas", "Repuestos originales"],
    price: "Desde $[PRECIO]",
  },
] as const;

export type Service = (typeof SERVICES)[number];
export type ServiceId = Service["id"];

export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === "string" && SERVICES.some((s) => s.id === value);
}

export function findService(id: ServiceId): Service {
  return SERVICES.find((s) => s.id === id) ?? SERVICES[0];
}

/** Pasos del servicio ("Así de fácil, como contar 1, 2, 3… ¡4!"). */
export const SERVICE_STEPS = [
  { title: "Cuéntanos", text: "Llena el formulario o escríbenos." },
  { title: "Te asesoramos", text: "Te proponemos muebles y medidas según la edad." },
  { title: "Agendamos", text: "Coordinamos fecha de entrega y armado." },
  { title: "¡A jugar!", text: "Dejamos el espacio listo y limpio." },
] as const;
