export type Section = "board" | "roles" | "repositories" | "budget";

const NAV_ITEMS: { section: Section; label: string }[] = [
  { section: "board", label: "Board" },
  { section: "roles", label: "Roles" },
  { section: "repositories", label: "Repositories" },
  { section: "budget", label: "Budget" },
];

export function Sidebar({
  active,
  onSelect,
}: {
  active: Section;
  onSelect: (section: Section) => void;
}) {
  return (
    <nav className="w-40 shrink-0 space-y-1 border-r border-neutral-200 bg-white p-3">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.section}
          onClick={() => onSelect(item.section)}
          className={`w-full rounded px-3 py-2 text-left text-sm ${
            active === item.section
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
