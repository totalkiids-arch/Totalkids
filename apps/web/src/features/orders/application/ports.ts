import type { GuestAccess } from "../domain/guest-lookup";
import type { Order } from "../domain/order";

/** Puerto: pedidos de los compradores. Con la API (LN-09), los consulta allí. */
export interface OrderRepository {
  /** Todos los pedidos, para el panel (RF-28). */
  listAll(): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
}

/** Puerto: credenciales de los pedidos que este navegador consultó como invitado (RF-36). */
export interface GuestAccessStore {
  read(): Promise<GuestAccess[]>;
  grant(entry: GuestAccess): Promise<void>;
}

/** Puerto: el pedido del comprador invitado en la API (LN-09, RF-23, RF-36). */
export interface GuestOrderGateway {
  /** Número + correo → pedido y su credencial; null si no coinciden (misma respuesta siempre). */
  lookup(orderId: string, email: string): Promise<{ order: Order; token: string } | null>;
  /** Pedido con su credencial; null si no existe o la credencial no es de ese pedido. */
  get(orderId: string, token: string): Promise<Order | null>;
}

/** La API no respondió o rechazó por límite de intentos; `message` es para el comprador. */
export class GuestOrderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestOrderUnavailableError";
  }
}
