import { LiveNotice } from "./notice";

/**
 * Aviso de una exportación CSV que no se pudo descargar (ver
 * shared/infrastructure/panel-export.ts): `aviso` es el parámetro de la URL.
 */
export function ExportNotice({ aviso }: { aviso: unknown }) {
  if (aviso === "exportar-acotar") {
    return (
      <LiveNotice
        message="No pudimos exportar: el resultado supera las 5.000 filas o el período no es válido. Acota los filtros e intenta de nuevo."
        tone="warning"
      />
    );
  }
  if (aviso === "exportar-error") {
    return (
      <LiveNotice
        message="No pudimos exportar. El servidor del panel no respondió; intenta de nuevo en unos minutos."
        tone="warning"
      />
    );
  }
  return null;
}
