import { useState } from "react";
import type { Skill } from "@kompanion/shared";
import { Button, Card, ErrorText, Muted } from "@/shared/ui/index.js";
import { useSkill, useUnregisterSkill } from "../hooks.js";

// One skill on the Skills page. Read-only: the folder on disk is the source of
// truth, so there is nothing to edit here. "View" shows the SKILL.md text, and
// "Unregister" removes only the row — it never touches the folder, and the
// server refuses while an Agent still has the skill (the message says which).
export function SkillRow({ skill }: { skill: Skill }) {
  const [open, setOpen] = useState(false);
  const detail = useSkill(skill.id, open);
  const unregister = useUnregisterSkill();

  return (
    <Card tone="soft" as="li" className="space-y-2" data-testid={`skill-${skill.slug}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-medium">{skill.slug}</code>
            {skill.broken && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
                broken
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-700">{skill.description}</p>
          <Muted size="xs">
            <code>{skill.skillPath}</code>
          </Muted>
          {skill.problem && <ErrorText>{skill.problem}</ErrorText>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide" : "View"}
          </Button>
          <Button
            variant="secondary"
            disabled={unregister.isPending}
            onClick={() => unregister.mutate(skill.id)}
          >
            Unregister
          </Button>
        </div>
      </div>

      {unregister.isError && <ErrorText>{(unregister.error as Error).message}</ErrorText>}

      {open && (
        <pre
          className="max-h-80 overflow-auto rounded bg-neutral-50 p-2 text-xs"
          aria-label={`SKILL.md of ${skill.slug}`}
        >
          {detail.isError
            ? "Could not load this skill."
            : detail.data
              ? (detail.data.body ?? "SKILL.md is not there any more.")
              : "Loading…"}
        </pre>
      )}
    </Card>
  );
}
