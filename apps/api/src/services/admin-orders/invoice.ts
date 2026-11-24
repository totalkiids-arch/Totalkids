import type { UserRole } from "../../generated/prisma/enums.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { isUniqueViolation, Issues } from "../admin-catalog/common.js";
import { writeAudit, type Actor } from "../audit.js";
import { lockOrder } from "./query.js";
import { invoiceAllowed, MESSAGES, REASON_MIN } from "./rules.js";
import type { InvoiceInput, OrderRef } from "./schemas.js";

/**
 * Factura del pedido (LN-13, UI-12). Total Kids la emite fuera de la tienda (SII
 * o su sistema de facturación) y aquí registra el folio: Flow solo cubre la
 * boleta. Administrador y Operador registran el primer folio; solo el
 * Administrador lo corrige (`replace: true`, con motivo). El folio es único
 * entre pedidos (`orders_invoice_folio_key`).
 */

export interface InvoiceResult {
  invoice: {
    number: string;
    issuedAt: string;
    issuedBy: string;
    issuedByName: string | null;
  };
  /** Folio anterior cuando se corrigió; null al registrar el primero. */
  previousNumber: string | null;
  invoicePending: false;
}

export async function registerInvoice(
  prisma: Pick<PrismaClient, "$transaction">,
  ref: OrderRef,
  input: InvoiceInput,
  actor: Actor,
  role: UserRole,
  requestId?: string,
  now = new Date(),
): Promise<{ status: 200 | 201; body: InvoiceResult }> {
  if (input.replace && role !== "admin") throw errors.forbidden(MESSAGES.invoiceReplaceForbidden);
  try {
    return await prisma.$transaction(async (tx) => {
      const id = await lockOrder(tx, ref);
      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        select: {
          number: true,
          status: true,
          paidAt: true,
          taxDocument: true,
          invoiceFolio: true,
        },
      });

      // 409: el estado del pedido no lo permite (mismo orden que el panel).
      if (order.taxDocument !== "factura") {
        throw errors.conflict(MESSAGES.invoiceBoleta, { field: "form" });
      }
      const previous = order.invoiceFolio;
      if (previous && !input.replace) {
        throw errors.conflict(MESSAGES.invoiceDone, { field: "form" });
      }
      if (!invoiceAllowed(order) || !order.paidAt) {
        throw errors.conflict(MESSAGES.invoiceUnpaid, { field: "form" });
      }

      // Corrección: motivo obligatorio y un folio distinto (422 por campo).
      const replacing = previous !== null;
      const reason = input.reason ?? "";
      if (replacing) {
        const issues = new Issues();
        if (input.number === previous) issues.add("number", MESSAGES.invoiceSame);
        if (reason.length < REASON_MIN) issues.add("reason", MESSAGES.invoiceReplaceReason);
        issues.throwIfAny();
      }

      const saved = await tx.order.update({
        where: { id },
        data: {
          invoiceFolio: input.number,
          invoiceIssuedAt: now,
          invoiceIssuedByUserId: actor.actorUserId,
          invoiceIssuedByLabel: actor.actorLabel,
        },
        select: { invoiceIssuedBy: { select: { name: true } } },
      });

      await writeAudit(
        tx,
        actor,
        replacing
          ? {
              action: "order.invoice_replaced",
              resourceType: "order",
              resourceId: id,
              details: { number: order.number, from: previous, to: input.number },
              reason,
            }
          : {
              action: "order.invoice_registered",
              resourceType: "order",
              resourceId: id,
              details: { number: order.number, folio: input.number },
            },
        requestId,
      );

      return {
        status: replacing ? 200 : 201,
        body: {
          invoice: {
            number: input.number,
            issuedAt: now.toISOString(),
            issuedBy: actor.actorLabel,
            issuedByName: saved.invoiceIssuedBy?.name ?? null,
          },
          previousNumber: previous,
          invoicePending: false,
        },
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw errors.conflict(MESSAGES.invoiceDuplicate, { field: "number" });
    }
    throw error;
  }
}
