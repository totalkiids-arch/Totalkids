import { StatusBadge, type StatusTone } from "@/shared/ui/admin/status-badge";

import { REQUEST_STATUS_LABEL, type RequestStatus } from "../../domain/service-request-admin";

const TONE: Record<RequestStatus, StatusTone> = {
  new: "blue",
  in_progress: "yellow",
  resolved: "green",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <StatusBadge tone={TONE[status]}>{REQUEST_STATUS_LABEL[status]}</StatusBadge>;
}
