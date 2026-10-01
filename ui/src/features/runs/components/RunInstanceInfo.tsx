import { SKILL_OUTCOME_LABEL, type TaskRun } from "@kompanion/shared";

const OUTCOME_ICON = {
  loaded: "✓",
  skipped_harness_has_it: "↷",
  missing: "✗",
} as const;

// What a run was built from: the stored agent instance (by hash), the commit
// of the library it came from, and what became of each skill the Agent had.
// Shown under the run's header. Runs from before agent instances existed have
// none of it, and show nothing.
//
// "uncommitted changes" matters: it means the commit alone would not
// reproduce the run — the instance hash is the exact record.
export function RunInstanceInfo({ run }: { run: TaskRun }) {
  if (!run.instanceHash) return null;

  return (
    <div
      data-testid="run-instance"
      aria-label="Agent instance"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-neutral-100 px-3 py-1.5 text-xs text-neutral-500"
    >
      <span>
        Agent instance <code title={run.instanceHash}>{run.instanceHash.slice(0, 8)}</code>
      </span>
      {run.gitSha && (
        <span title={run.gitSha}>
          · library <code>{run.gitSha.slice(0, 7)}</code>
          {run.gitDirty && <span className="text-amber-600"> (uncommitted changes)</span>}
        </span>
      )}
      <span>
        ·{" "}
        {run.skills.length === 0 ? (
          "no skills"
        ) : (
          <>
            skills:{" "}
            {run.skills.map((skill, i) => (
              <span
                key={skill.slug}
                title={`${SKILL_OUTCOME_LABEL[skill.outcome]}${skill.hash ? `\n${skill.hash}` : ""}`}
                className={skill.outcome === "loaded" ? "" : "text-amber-600"}
              >
                {i > 0 && ", "}
                <code>{skill.slug}</code> {OUTCOME_ICON[skill.outcome]}
              </span>
            ))}
          </>
        )}
      </span>
    </div>
  );
}
