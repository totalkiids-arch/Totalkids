import type { FieldErrors, ShippingSettings, ShippingZone } from "../domain/shipping-zone";

export type ShippingResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

/** Datos del formulario de zona tal como llegan (texto), antes de validar. */
export interface ZoneInput {
  region: string;
  commune: string;
  /** Vacío = tarifa a coordinar. */
  price: string;
  leadTime: string;
  freeShippingEligible: boolean;
  active: boolean;
}

export interface SettingsInput {
  pickupEnabled: boolean;
  pickup: string;
  freeShippingThreshold: string;
  reservationMinutes: string;
}

/**
 * Puerto: zonas de despacho y condiciones de retiro del panel (RF-27). Lo
 * implementa la API (/admin/shipping-zones y /admin/shipping-settings, solo
 * Administrador), que valida y registra el cambio. Afecta solo compras nuevas.
 */
export interface ShippingAdmin {
  /** De norte a sur y luego por comuna (orden de la API). */
  listZones(): Promise<ShippingZone[]>;
  /** id null crea una zona nueva. */
  saveZone(id: string | null, input: ZoneInput): Promise<ShippingResult<ShippingZone>>;
  /** null si la zona ya no existe. */
  setZoneActive(id: string, active: boolean): Promise<ShippingZone | null>;
  getSettings(): Promise<ShippingSettings>;
  saveSettings(input: SettingsInput): Promise<ShippingResult<ShippingSettings>>;
}
