-- LN-08: correo con el enlace para confirmar la baja del newsletter (RF-35).
-- El token se emite al enviar el correo y en la base queda solo su hash
-- (newsletter_subscribers.unsubscribe_token_hash).
ALTER TYPE "email_event" ADD VALUE 'newsletter_unsubscribe';
