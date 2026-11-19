import Link, { type LinkProps } from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Botones "de juguete" de la maqueta: píldora con sombra sólida inferior que da
 * volumen. Al presionar, el botón baja y la sombra se acorta.
 */
const VARIANTS = {
  primary: "bg-brand-blue text-white shadow-[0_6px_0_var(--color-brand-blue-deep)]",
  accent: "bg-brand-yellow text-brand-navy shadow-[0_6px_0_var(--color-brand-yellow-deep)]",
  danger: "bg-brand-red text-white shadow-[0_5px_0_var(--color-brand-red-deep)]",
  light: "bg-surface text-text-primary shadow-[0_6px_0_var(--color-ochre)]",
  dark: "bg-brand-navy text-white",
  outline: "border-2 border-brand-navy bg-surface text-text-primary",
  ghost: "text-text-primary hover:bg-soft-yellow",
} as const;

const SIZES = {
  md: "min-h-11 px-6 py-3 text-base",
  lg: "min-h-13 px-7 py-3.5 text-[17px]",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

interface StyleProps {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  className?: string;
}

export function buttonClasses({ variant = "primary", size = "md", className = "" }: StyleProps) {
  return [
    "inline-flex items-center justify-center gap-2.5 rounded-full font-extrabold whitespace-nowrap",
    "transition-transform motion-safe:active:translate-y-1 active:shadow-none",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    className,
  ].join(" ");
}

type ButtonLinkProps<T extends string> = LinkProps<T> & StyleProps & { children: ReactNode };

export function ButtonLink<T extends string>({
  variant,
  size,
  className,
  children,
  ...props
}: ButtonLinkProps<T>) {
  return (
    <Link {...props} className={buttonClasses({ variant, size, className })}>
      {children}
    </Link>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & StyleProps;

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} {...props} className={buttonClasses({ variant, size, className })} />;
}
