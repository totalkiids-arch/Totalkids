import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";

import { EMAIL_STATUS_LABEL, type EmailStatus } from "../domain/email-log";

const TONE: Record<EmailStatus, StatusTone> = {
  pending: "neutral",
  sent: "green",
  failed: "red",
  uncertain: "yellow",
};

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <StatusBadge tone={TONE[status]}>{EMAIL_STATUS_LABEL[status]}</StatusBadge>;
}
