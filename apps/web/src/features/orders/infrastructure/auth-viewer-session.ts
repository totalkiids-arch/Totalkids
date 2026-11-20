import "server-only";

import { getCurrentBuyer } from "@/features/auth";

import type { ViewerSession } from "../application/ports";

/** El comprador con sesión iniciada, según la feature "auth". */
export const authViewerSession: ViewerSession = {
  currentBuyer: getCurrentBuyer,
};
