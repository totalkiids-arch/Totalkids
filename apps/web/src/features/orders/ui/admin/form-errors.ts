import type { FormErrorItem } from "@/shared/ui/admin/notice";

/** Errores por campo → lista del resumen, enlazada al id de cada campo. */
export function errorSummary(
  errors: Partial<Record<string, string>>,
  ids: Record<string, string>,
): FormErrorItem[] {
  return Object.entries(errors).flatMap(([key, message]) =>
    message ? [{ fieldId: key === "form" ? undefined : ids[key], message }] : [],
  );
}
