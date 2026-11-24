import type { CategorySlug } from "./product";

/**
 * Contenido editorial de la tienda que no vive en la base: los cuidados
 * generales, la frase de Tito y "Cómo aprende jugando" por categoría. Dominio
 * puro. Si el panel crea una categoría nueva, la ficha simplemente no muestra
 * estas secciones.
 */

/** Plazo general de fabricación ("Tiempo de fabricación 3 a 5 días hábiles"). */
export const STORE_LEAD_TIME = "3 a 5 días hábiles";

export const CARE = [
  "Llega embalado, con piezas identificadas e instrucciones de armado.",
  "Limpieza con paño húmedo y jabón neutro; evita productos abrasivos.",
  "Revisa y reaprieta tornillos y uniones cada cierto tiempo, sobre todo en uso diario de aula.",
];

/** Contenido de tienda por categoría: Tito y "Cómo aprende jugando". */
export const CATEGORY_STORY: Record<
  CategorySlug,
  { quote: string; learning: { title: string; text: string }[] }
> = {
  cunas: {
    quote: "¡En mi cuna descanso tranquilo y despierto listo para jugar!",
    learning: [
      { title: "Descanso", text: "Un lugar seguro y propio ayuda a crear rutinas de sueño." },
      { title: "Seguridad", text: "Barandas y alturas pensadas para salas cuna." },
      { title: "Confianza", text: "Siempre a la vista de quien lo cuida." },
    ],
  },
  mesas: {
    quote: "¡En mi mesa pinto, armo y comparto con mis amigos!",
    learning: [
      {
        title: "Concentración",
        text: "A su altura, los pies tocan el suelo y la espalda descansa.",
      },
      { title: "Compartir", text: "Un espacio común para crear, conversar y comer juntos." },
      { title: "Motricidad fina", text: "Dibujar, recortar y armar con comodidad." },
    ],
  },
  sillas: {
    quote: "¡Me siento solito y mis pies llegan al suelo!",
    learning: [
      { title: "Autonomía", text: "Se sientan y se levantan sin ayuda." },
      { title: "Postura", text: "La altura justa para cada nivel cuida su espalda." },
      { title: "Atención", text: "Cómodos, se concentran más tiempo en lo que hacen." },
    ],
  },
  mudadores: {
    quote: "¡El momento del cambio también es para conversar y reír!",
    learning: [
      { title: "Vínculo", text: "El cambio de muda es un momento de contacto y conversación." },
      { title: "Seguridad", text: "Barandas y superficies acolchadas para cada movimiento." },
      { title: "Orden", text: "Cada niño tiene su espacio para sus cosas." },
    ],
  },
  almacenamiento: {
    quote: "¡Cada juguete tiene su casa y yo sé dónde va!",
    learning: [
      { title: "Orden", text: "A su altura, guardar al terminar se vuelve parte del juego." },
      { title: "Autonomía", text: "Eligen y devuelven sus materiales sin ayuda." },
      { title: "Clasificar", text: "Agrupar por tipo o color es su primer ejercicio lógico." },
    ],
  },
  "montessori-pikler": {
    quote: "¡Subo, bajo y me deslizo a mi ritmo!",
    learning: [
      { title: "Movimiento libre", text: "Exploran su cuerpo y sus límites sin apuro." },
      { title: "Confianza", text: "Cada logro lo consiguen por sí mismos." },
      { title: "Coordinación", text: "Trepar y equilibrarse desarrolla la motricidad gruesa." },
    ],
  },
  junji: {
    quote: "¡Mi sala está hecha a mi medida!",
    learning: [
      { title: "A su medida", text: "Mobiliario pensado para cada nivel educativo." },
      { title: "Seguridad", text: "Bordes redondeados y materiales no tóxicos." },
      { title: "Autonomía", text: "Todo a su alcance para hacerlo por sí mismos." },
    ],
  },
};

/** Atributo destacado junto a plazo y garantía, según la descripción y la ficha técnica. */
export function productHighlight(text: string): string {
  return /redondead|sin filo/.test(text.toLowerCase())
    ? "Bordes redondeados"
    : "Fabricación propia";
}
