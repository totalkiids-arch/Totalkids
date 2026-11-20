import type { FieldErrors, ShippingSettings, ShippingZone } from "../domain/shipping-zone";

export type ShippingResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

/** Datos del formulario de zona tal como llegan (texto), antes de validar. */
export interface ZoneInput {
  region: string;
  commune: string;
  price: string;
  leadTime: string;
  active: boolean;
}

export interface SettingsInput {
  pickup: string;
  freeShippingThreshold: string;
  reservationMinutes: string;
}

/**
 * Puerto: zonas de despacho y condiciones de retiro del panel (RF-27).
 * El adaptador valida con las reglas del dominio; con la API (LN-12), también
 * las aplica el backend.
 */
export interface ShippingAdmin {
  listZones(): Promise<ShippingZone[]>;
  /** id null crea una zona nueva. */
  saveZone(id: string | null, input: ZoneInput): Promise<ShippingResult<ShippingZone>>;
  /** null si la zona ya no existe. */
  setZoneActive(id: string, active: boolean): Promise<ShippingZone | null>;
  getSettings(): Promise<ShippingSettings>;
  saveSettings(input: SettingsInput): Promise<ShippingResult<ShippingSettings>>;
}
