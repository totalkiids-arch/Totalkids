import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Campos de formulario de Total Kids. Cada campo:
 * - tiene etiqueta visible asociada (htmlFor/id),
 * - conecta ayuda y error con aria-describedby,
 * - marca aria-invalid cuando hay error; el mensaje se lee al enfocar el campo
 *   (no usa role="alert", para no interrumpir mientras se escribe).
 */

const CONTROL =
  "w-full border-2 bg-surface text-base text-text-primary placeholder:text-text-secondary " +
  "border-chip-border hover:border-input-border focus:border-brand-blue " +
  "aria-invalid:border-brand-red disabled:cursor-not-allowed disabled:bg-background disabled:opacity-70";

const SHAPE = {
  rounded: "h-12 rounded-xl px-4",
  pill: "h-13 rounded-full px-5",
} as const;

interface FieldChromeProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * Oculta la etiqueta visualmente (sigue disponible para lectores de pantalla).
   * "mobile": solo en pantallas angostas.
   */
  hideLabel?: boolean | "mobile";
}

function useFieldIds(error?: ReactNode, hint?: ReactNode) {
  const id = useId();
  const hintId = hint ? `${id}-ayuda` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return {
    id,
    hintId,
    errorId,
    describedBy: [errorId, hintId].filter(Boolean).join(" ") || undefined,
  };
}

function Label({
  htmlFor,
  hidden,
  children,
}: {
  htmlFor: string;
  hidden?: boolean | "mobile";
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={
        hidden === true
          ? "sr-only"
          : `text-sm font-extrabold whitespace-nowrap text-text-primary ${hidden === "mobile" ? "max-sm:sr-only" : ""}`
      }
    >
      {children}
    </label>
  );
}

function Messages({
  hintId,
  errorId,
  hint,
  error,
}: {
  hintId?: string;
  errorId?: string;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  return (
    <>
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-bold text-brand-red">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="mt-0.5 size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 17h.01" />
          </svg>
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-[13px] text-text-secondary">
          {hint}
        </p>
      ) : null}
    </>
  );
}

type TextFieldProps = FieldChromeProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & {
    shape?: keyof typeof SHAPE;
    /** React 19: el ref llega como prop y se pasa al <input> (p. ej. para enfocar un error). */
    ref?: Ref<HTMLInputElement>;
  };

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  shape = "rounded",
  className = "",
  ...props
}: TextFieldProps) {
  const ids = useFieldIds(error, hint);
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <Label htmlFor={ids.id} hidden={hideLabel}>
        {label}
      </Label>
      <input
        id={ids.id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={`${CONTROL} ${SHAPE[shape]}`}
        {...props}
      />
      <Messages {...ids} hint={hint} error={error} />
    </div>
  );
}

type TextareaFieldProps = FieldChromeProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextareaField({
  label,
  hint,
  error,
  hideLabel,
  className = "",
  rows = 4,
  ...props
}: TextareaFieldProps) {
  const ids = useFieldIds(error, hint);
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <Label htmlFor={ids.id} hidden={hideLabel}>
        {label}
      </Label>
      <textarea
        id={ids.id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={`${CONTROL} rounded-xl px-4 py-3 leading-relaxed`}
        {...props}
      />
      <Messages {...ids} hint={hint} error={error} />
    </div>
  );
}

type SelectFieldProps = FieldChromeProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
    options: readonly { value: string; label: string }[];
    /** Etiqueta a la izquierda del control (barras de orden). */
    inline?: boolean;
  };

export function SelectField({
  label,
  hint,
  error,
  hideLabel,
  inline = false,
  options,
  className = "",
  ...props
}: SelectFieldProps) {
  const ids = useFieldIds(error, hint);
  return (
    <div
      className={`flex min-w-0 gap-1.5 ${inline ? "flex-row items-center gap-2.5" : "flex-col"} ${className}`}
    >
      <Label htmlFor={ids.id} hidden={hideLabel}>
        {label}
      </Label>
      <select
        id={ids.id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={`${CONTROL} h-11 w-auto cursor-pointer rounded-full pr-10 pl-4 font-bold`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Messages {...ids} hint={hint} error={error} />
    </div>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  label: ReactNode;
  description?: ReactNode;
};

/** Casilla con etiqueta clicable. Área táctil de al menos 44 px de alto. */
export function Checkbox({ label, description, className = "", ...props }: CheckboxProps) {
  const id = useId();
  return (
    <div className={`flex min-h-11 items-start gap-2.5 py-1.5 ${className}`}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={description ? `${id}-desc` : undefined}
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-blue"
        {...props}
      />
      <span className="flex flex-col">
        <label htmlFor={id} className="cursor-pointer text-[15px]">
          {label}
        </label>
        {description ? (
          <span id={`${id}-desc`} className="text-[13px] text-text-secondary">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

interface RadioGroupProps extends Omit<FieldChromeProps, "label"> {
  legend: ReactNode;
  name: string;
  options: readonly { value: string; label: ReactNode; description?: ReactNode }[];
  defaultValue?: string;
  required?: boolean;
  /** Opciones como tarjetas seleccionables (despacho/retiro, boleta/factura). */
  variant?: "list" | "cards";
}

export function RadioGroup({
  legend,
  name,
  options,
  defaultValue,
  required,
  hint,
  error,
  variant = "list",
}: RadioGroupProps) {
  const ids = useFieldIds(error, hint);
  return (
    <fieldset aria-describedby={ids.describedBy} className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-extrabold text-text-primary">{legend}</legend>
      <div
        className={
          variant === "cards"
            ? "grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3"
            : "flex flex-col"
        }
      >
        {options.map((option) => {
          const optionId = `${ids.id}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={
                variant === "cards"
                  ? "flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-chip-border bg-surface p-4 has-checked:border-brand-blue has-checked:bg-soft-blue has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-blue"
                  : "flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5"
              }
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                defaultChecked={option.value === defaultValue}
                required={required}
                className={`mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-blue ${variant === "cards" ? "focus-visible:outline-none" : ""}`}
              />
              <span className="flex flex-col">
                <span className={variant === "cards" ? "font-extrabold" : "text-[15px]"}>
                  {option.label}
                </span>
                {option.description ? (
                  <span className="text-[13px] text-text-secondary">{option.description}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <Messages {...ids} hint={hint} error={error} />
    </fieldset>
  );
}
