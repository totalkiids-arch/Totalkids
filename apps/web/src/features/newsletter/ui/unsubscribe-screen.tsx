import { Tito } from "@/shared/ui/brand/tito";

import { UnsubscribeConfirm } from "./unsubscribe-confirm";

/** Tienda · Confirmar la baja del newsletter desde el enlace del correo (RF-35). */
export function UnsubscribeScreen({ token }: { token: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 rounded-[32px] bg-surface p-5 shadow-[0_2px_0_var(--color-border)] sm:p-7">
        <div className="flex items-center gap-4">
          <Tito className="w-16 shrink-0" />
          <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] leading-tight font-extrabold">
            Darme de baja del newsletter
          </h1>
        </div>
        <UnsubscribeConfirm token={token} />
      </div>
    </div>
  );
}
