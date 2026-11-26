-- Alerta al equipo cuando el worker alcanza el límite diario de correos
-- (EMAIL_DAILY_LIMIT, plan gratis de Brevo). Solo agrega el valor al enum.
ALTER TYPE "email_event" ADD VALUE 'email_quota_alert';
