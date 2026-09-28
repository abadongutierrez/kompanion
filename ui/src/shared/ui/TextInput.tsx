import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// One border/padding rule for every field in the app. `density` covers the
// three already in use: "sm" inside cards and inline rows, "md" for the
// standalone forms (create project, agent form), "xs" for the secondary
// controls on a task card.
//
// It is not called `size` on purpose — input and select both have a real
// HTML `size` attribute, and shadowing it would make that unreachable.
export type FieldDensity = "xs" | "sm" | "md";

// Every combination the app actually uses, written out. Text size is part of
// the density rather than a className a caller layers on top: text-xs and
// text-sm sit in the same Tailwind layer, so passing both would leave the
// winner up to stylesheet order.
const DENSITIES: Record<FieldDensity, string> = {
  xs: "rounded border border-neutral-300 px-2 py-1 text-xs",
  sm: "rounded border border-neutral-300 px-2 py-1 text-sm",
  md: "rounded border border-neutral-300 px-3 py-2 text-sm",
};

// Width is a prop, not something a caller overrides through className:
// w-full and w-auto sit in the same Tailwind layer, so passing both leaves
// the winner up to stylesheet order. Fields inside a flex row pass
// fullWidth={false} and size themselves with flex-1.
function fieldClass(density: FieldDensity, fullWidth: boolean, className?: string) {
  const base = fullWidth ? `w-full ${DENSITIES[density]}` : DENSITIES[density];
  return className ? `${base} ${className}` : base;
}

type FieldProps = { density?: FieldDensity; fullWidth?: boolean };

export function TextInput({
  density = "sm",
  fullWidth = true,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  return <input className={fieldClass(density, fullWidth, className)} {...props} />;
}

export function TextArea({
  density = "sm",
  fullWidth = true,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  return <textarea className={fieldClass(density, fullWidth, className)} {...props} />;
}

export function Select({
  density = "sm",
  fullWidth = true,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  return <select className={fieldClass(density, fullWidth, className)} {...props} />;
}
