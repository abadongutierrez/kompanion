import type { HTMLAttributes, LabelHTMLAttributes } from "react";

// The text roles that repeat across every panel: the small-caps heading over
// a section, the same treatment for a field label, muted secondary copy, and
// an inline error.

const SMALL_CAPS = "text-xs font-semibold uppercase text-neutral-500";

// Written out in full, not interpolated: Tailwind scans source statically,
// so a `text-${size}` template never gets generated.
const MUTED_SIZES = {
  xs: "text-xs text-neutral-500",
  sm: "text-sm text-neutral-500",
} as const;

// A section title. Same treatment as FieldLabel, different element and
// meaning — this one heads a region, it does not label a control. `as`
// keeps the heading level honest for a subsection.
export function SectionHeading({
  as: Tag = "h2",
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" }) {
  return <Tag className={className ? `${SMALL_CAPS} ${className}` : SMALL_CAPS} {...props} />;
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={className ? `${SMALL_CAPS} ${className}` : SMALL_CAPS} {...props} />;
}

// Secondary copy. Both sizes are in use — "sm" for standalone paragraphs,
// "xs" for the notes under a field or inside a card. It is a prop rather
// than a className override because text-xs and text-sm live in the same
// Tailwind layer: passing both leaves the winner up to stylesheet order.
export function Muted({
  size = "sm",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { size?: "xs" | "sm" }) {
  const base = MUTED_SIZES[size];
  return <p className={className ? `${base} ${className}` : base} {...props} />;
}

export function ErrorText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const base = "text-xs text-red-600";
  return <p className={className ? `${base} ${className}` : base} {...props} />;
}
