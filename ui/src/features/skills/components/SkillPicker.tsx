import type { AgentSkill, Skill } from "@kompanion/shared";
import { Muted } from "@/shared/ui/index.js";

// The "Skills" section of the Agent form: every skill in the library with a
// checkbox, ticked for the ones the Agent should learn. It only edits the
// selection; the form saves it with the Agent.
//
// Whether the harness already has a skill with the same slug is only known
// for skills the Agent already has (the server answers per assigned skill), so
// that note shows for those. The harness wins, and the note says so.
export function SkillPicker({
  skills,
  selected,
  onChange,
  assigned,
}: {
  skills: Skill[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  assigned: AgentSkill[];
}) {
  const shadowed = new Set(
    assigned.filter((a) => a.shadowedByHarness).map((a) => a.skill.id),
  );

  function toggle(skillId: string) {
    const next = new Set(selected);
    if (next.has(skillId)) next.delete(skillId);
    else next.add(skillId);
    onChange(next);
  }

  if (skills.length === 0) {
    return (
      <Muted size="xs">
        No skills in the library yet. Add some on the Skills page, then teach them here.
      </Muted>
    );
  }

  return (
    <ul className="space-y-1" aria-label="Skills">
      {skills.map((skill) => (
        <li key={skill.id}>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              aria-label={skill.slug}
              checked={selected.has(skill.id)}
              onChange={() => toggle(skill.id)}
            />
            <span className="min-w-0">
              <code className="font-medium">{skill.slug}</code>
              {skill.broken && (
                <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
                  broken
                </span>
              )}
              <span className="block text-xs text-neutral-500">{skill.description}</span>
              {selected.has(skill.id) && shadowed.has(skill.id) && (
                <span className="block text-xs text-amber-600">
                  The harness already has a skill with this name, so the harness copy wins
                  and this one is skipped.
                </span>
              )}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
