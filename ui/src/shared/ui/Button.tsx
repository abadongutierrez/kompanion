import type { ButtonHTMLAttributes } from "react";
import type { FieldDensity } from "./TextInput.js";

// The two button shapes the app already uses: a solid dark one for the
// primary action in a form or card, and an outlined one beside it.
export type ButtonVariant = "primary" | "secondary";

// Same two densities as the fields, and for the same reason — "sm" inside
// cards and inline rows, "md" on the standalone create forms.
const DENSITIES: Record<FieldDensity, string> = {
  xs: "px-3 py-1 text-xs",
  sm: "px-3 py-1 text-xs",
  md: "px-3 py-2 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "rounded bg-neutral-900 text-white disabled:opacity-50",
  secondary:
    "rounded border border-neutral-300 hover:bg-neutral-100 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  density = "sm",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  density?: FieldDensity;
}) {
  const base = `${VARIANTS[variant]} ${DENSITIES[density]}`;
  return (
    <button
      type={type}
      className={className ? `${base} ${className}` : base}
      {...props}
    />
  );
}
