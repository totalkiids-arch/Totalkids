"use client";

import { useEffect, useState } from "react";

import { toHealthState, type HealthState } from "@/lib/health";

export function HealthStatus() {
  const [health, setHealth] = useState<HealthState>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then(async (res) => setHealth(toHealthState(res.ok, await res.json().catch(() => null))))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setHealth({ state: "error", message: err instanceof Error ? err.message : "Error" });
        }
      });
    return () => controller.abort();
  }, []);

  const label = {
    loading: "Verificando API…",
    ok: "API operativa",
    error: health.state === "error" ? `API con problemas: ${health.message}` : "",
  }[health.state];

  const color = {
    loading: "bg-gray-400",
    ok: "bg-green-500",
    error: "bg-red-500",
  }[health.state];

  return (
    <p
      className="flex items-center gap-2 text-sm text-gray-700"
      role="status"
      data-state={health.state}
    >
      <span className={`inline-block size-2.5 rounded-full ${color}`} aria-hidden />
      {label}
    </p>
  );
}
