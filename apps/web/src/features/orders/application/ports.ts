import type { Order } from "../domain/order";

/** Puerto: pedidos de los compradores. Con la API (LN-09), los consulta allí. */
export interface OrderRepository {
  listByEmail(email: string): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
}

/** Puerto: correo del comprador con sesión iniciada (lo resuelve la feature "auth"). */
export interface ViewerSession {
  currentBuyer(): Promise<{ name: string; email: string } | null>;
}

/** Puerto: pedidos que este navegador consultó como invitado (RF-36). */
export interface GuestAccessStore {
  read(): Promise<string[]>;
  grant(orderId: string): Promise<void>;
}
