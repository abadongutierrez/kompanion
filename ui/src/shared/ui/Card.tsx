import type { ComponentPropsWithoutRef, ElementType } from "react";

// The white bordered panel that task cards, agent rows, repository rows and
// budget rows are all built from. `tone` keeps the two borders already in
// the codebase: "strong" (neutral-300) for interactive cards, "soft"
// (neutral-200) for read-only rows.
export type CardTone = "strong" | "soft";

// A card is often a <form> or an <li> rather than a <div> — the panels wrap
// their create/edit forms in one. Narrow union rather than full polymorphism:
// these are the only elements a card has ever needed to be.
export type CardElement = "div" | "form" | "section" | "li";

const TONES: Record<CardTone, string> = {
  strong: "rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm",
  soft: "rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm",
};

export function Card<T extends CardElement = "div">({
  as,
  tone = "strong",
  className,
  ...props
}: { as?: T; tone?: CardTone } & Omit<ComponentPropsWithoutRef<T>, "as">) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={className ? `${TONES[tone]} ${className}` : TONES[tone]}
      {...props}
    />
  );
}
