/** Datos de contacto que Tito puede mostrar; null = el cliente aún no los define. */
export interface ContactInfo {
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  whatsapp: string | null;
}

/** Los valores entre corchetes de `site` son marcadores: no se muestran al comprador. */
export function definedOrNull(value: string | null): string | null {
  return value && !/[[\]]/.test(value) ? value : null;
}
