"use client";

import { useEffect, useState } from "react";

import { healthGateway } from "../container";
import type { HealthState } from "../domain/health";

const LABEL: Record<HealthState["state"], string> = {
  loading: "Verificando API…",
  ok: "API operativa",
  error: "API con problemas",
};

const COLOR: Record<HealthState["state"], string> = {
  loading: "bg-gray-400",
  ok: "bg-green-500",
  error: "bg-red-500",
};

export function HealthStatus() {
  const [health, setHealth] = useState<HealthState>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    healthGateway
      .check(controller.signal)
      .then(setHealth)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setHealth({ state: "error", message: err instanceof Error ? err.message : "Error" });
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <p
      className="flex items-center gap-2 text-sm text-gray-700"
      role="status"
      data-state={health.state}
    >
      <span className={`inline-block size-2.5 rounded-full ${COLOR[health.state]}`} aria-hidden />
      {LABEL[health.state]}
      {health.state === "error" ? `: ${health.message}` : null}
    </p>
  );
}
