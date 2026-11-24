-- LN-10: URL de pago de Flow cifrada (AES-256-GCM), para reutilizar un intento
-- vigente (RF-15). El token en claro no se guarda nunca (SRS 4.5).
ALTER TABLE "payments" ADD COLUMN "redirect_url_encrypted" TEXT;
