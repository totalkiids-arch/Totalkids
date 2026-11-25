-- LN-15: aviso por correo al equipo cuando un pago necesita revisión (RN-04, RN-05).
ALTER TYPE "email_event" ADD VALUE 'payment_review';
