import type { Order } from "../domain/order";

/** Puerto: pedidos de los compradores. Con la API (LN-09), los consulta allí. */
export interface OrderRepository {
  /** Todos los pedidos, para el panel (RF-28). */
  listAll(): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
}

/** Puerto: pedidos que este navegador consultó como invitado (RF-36). */
export interface GuestAccessStore {
  read(): Promise<string[]>;
  grant(orderId: string): Promise<void>;
}
