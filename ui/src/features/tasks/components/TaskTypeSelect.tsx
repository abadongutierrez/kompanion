import type { TaskType } from "@kompanion/shared";
import { Select } from "@/shared/ui/index.js";

// The same four options in the create form and the edit form.
const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "story", label: "Story" },
  { value: "bug", label: "Bug" },
  { value: "chore", label: "Chore" },
  { value: "spike", label: "Spike" },
];

export function TaskTypeSelect({
  value,
  onChange,
}: {
  value: TaskType;
  onChange: (type: TaskType) => void;
}) {
  return (
    <Select
      fullWidth={false}
      density="xs"
      value={value}
      onChange={(e) => onChange(e.target.value as TaskType)}
    >
      {TASK_TYPES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </Select>
  );
}
