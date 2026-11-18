import { HealthStatus } from "@/components/health-status";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Total Kids</h1>
      <HealthStatus />
    </main>
  );
}
