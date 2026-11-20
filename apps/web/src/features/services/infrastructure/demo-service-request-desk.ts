import "server-only";

import type { ServiceRequestGateway } from "../application/ports";
import type { ServiceRequestAdmin } from "../application/service-request-admin";
import {
  applyFollowUp,
  receiveRequest,
  type AdminServiceRequest,
} from "../domain/service-request-admin";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALMACÉN DE DEMOSTRACIÓN — NO ES PERSISTENCIA REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del servidor de Next.js: se pierde al reiniciar o
 *    redesplegar y no se comparte entre instancias.
 *  - Recibe las solicitudes del formulario público (/servicios/solicitar) y
 *    las muestra en el panel (/admin/solicitudes). No envía correos.
 *  - LN-08/LN-13 lo reemplazan por adaptadores que llaman a la API
 *    (POST /service-requests y /admin/service-requests), con las mismas
 *    interfaces ServiceRequestGateway y ServiceRequestAdmin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  requests: AdminServiceRequest[];
  sequence: number;
}

function seed(): DemoState {
  const requests: AdminServiceRequest[] = [
    {
      ...receiveRequest(
        "SOL-1001",
        {
          service: "armado",
          name: "Camila González",
          email: "camila@example.com",
          phone: "+56911112222",
          commune: "Temuco",
          ages: "4 años",
          preferredDate: "2026-11-14",
          message: "Quiero que armen la cama tipo jeep del pedido TK-1048 y la fijen a la pared.",
        },
        "2026-11-10T12:30:00-03:00",
      ),
      status: "resolved",
      note: "Armado coordinado y realizado el 14-11.",
      history: [
        { at: "2026-11-10T12:30:00-03:00", actor: "Solicitante", change: "Solicitud recibida" },
        {
          at: "2026-11-11T09:00:00-03:00",
          actor: "Operador",
          change: "Estado: Nueva → En gestión · Nota interna actualizada",
        },
        {
          at: "2026-11-14T18:10:00-03:00",
          actor: "Operador",
          change: "Estado: En gestión → Resuelta",
        },
      ],
    },
    {
      ...receiveRequest(
        "SOL-1002",
        {
          service: "instituciones",
          name: "Marcela Fuentes",
          email: "direccion.lospeques@example.com",
          phone: "+56933334444",
          commune: "Padre Las Casas",
          ages: "2 a 4 años",
          preferredDate: null,
          message:
            "Somos un jardín JUNJI y necesitamos cotizar mesas grupales y sillas apilables para dos salas.",
        },
        "2026-11-16T10:05:00-03:00",
      ),
      status: "in_progress",
      note: "Enviar cotización formal con factura. Visita técnica por agendar.",
      history: [
        { at: "2026-11-16T10:05:00-03:00", actor: "Solicitante", change: "Solicitud recibida" },
        {
          at: "2026-11-16T15:20:00-03:00",
          actor: "Administrador",
          change: "Estado: Nueva → En gestión · Nota interna actualizada",
        },
      ],
    },
    {
      ...receiveRequest(
        "SOL-1003",
        {
          service: "diseno",
          name: "Fernanda Soto",
          email: "fernanda@example.com",
          phone: null,
          commune: "Villarrica",
          ages: "1 y 3 años",
          preferredDate: "2026-12-05",
          message: "Me gustaría una propuesta de sala de juegos Montessori para dos hermanos.",
        },
        "2026-11-18T20:15:00-03:00",
      ),
    },
    receiveRequest(
      "SOL-1004",
      {
        service: "personalizacion",
        name: "Javier Muñoz",
        email: "javier@example.com",
        phone: "+56955556666",
        commune: "Temuco",
        ages: "5 años",
        preferredDate: null,
        message: "¿Pueden grabar el nombre «Tomás» en la cabecera de la cama casita?",
      },
      "2026-11-19T11:40:00-03:00",
    ),
    {
      ...receiveRequest(
        "SOL-1005",
        {
          service: "regalos",
          name: "Daniela Rojas",
          email: "daniela@example.com",
          phone: null,
          commune: null,
          ages: "Recién nacido",
          preferredDate: null,
          message: "Quiero armar una lista de regalos para un baby shower en diciembre.",
        },
        "2026-11-17T08:50:00-03:00",
      ),
      status: "in_progress",
      history: [
        { at: "2026-11-17T08:50:00-03:00", actor: "Solicitante", change: "Solicitud recibida" },
        {
          at: "2026-11-17T12:00:00-03:00",
          actor: "Operador",
          change: "Estado: Nueva → En gestión",
        },
      ],
    },
    receiveRequest(
      "SOL-1006",
      {
        service: "garantia",
        name: "Pablo Pérez",
        email: "pablo@example.com",
        phone: "+56977778888",
        commune: "Lautaro",
        ages: "6 años",
        preferredDate: null,
        message: "La silla de la mesa grupal quedó coja; necesito un ajuste o un repuesto.",
      },
      "2026-11-20T09:15:00-03:00",
    ),
  ];
  return { requests, sequence: 1006 };
}

// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoServiceRequests?: DemoState };
const state = () => (holder.__tkDemoServiceRequests ??= seed());

const clone = <T>(value: T): T => structuredClone(value);

/** Implementa el puerto del formulario público y el del panel sobre los mismos datos. */
export const demoServiceRequestDesk: ServiceRequestGateway & ServiceRequestAdmin = {
  async submit(request) {
    const s = state();
    s.sequence += 1;
    const created = receiveRequest(`SOL-${s.sequence}`, request, new Date().toISOString());
    s.requests.push(created);
    return { reference: created.id };
  },

  async list() {
    return clone(state().requests);
  },

  async get(id) {
    const found = state().requests.find((r) => r.id === id);
    return found ? clone(found) : null;
  },

  async followUp(id, input, actor) {
    const s = state();
    const index = s.requests.findIndex((r) => r.id === id);
    const current = s.requests[index];
    if (!current) return { ok: false, errors: { form: "Esa solicitud ya no existe." } };
    const result = applyFollowUp(current, input, actor, new Date().toISOString());
    if (result.ok) s.requests[index] = result.request;
    return result.ok ? { ok: true, request: clone(result.request) } : result;
  },
};
