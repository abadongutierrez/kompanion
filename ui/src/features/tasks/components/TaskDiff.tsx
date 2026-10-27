import type { RepositoryDiff } from "@kompanion/shared";
import { useTaskDiff } from "../hooks.js";

// The task's worktree in each linked repository, compared with the branch it
// was cut from. Read-only and local: nothing is pushed or fetched.
export function TaskDiff({
  teamId,
  taskId,
  active,
  isRunning,
}: {
  teamId: string;
  taskId: string;
  active: boolean;
  isRunning: boolean;
}) {
  const diffs = useTaskDiff(teamId, taskId, { enabled: active, isRunning });

  if (diffs.isError) {
    return <p className="text-sm text-red-600">Could not load the diff.</p>;
  }
  if (!diffs.data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }
  if (diffs.data.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        This task has no linked repository, so there is nothing to diff.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {diffs.data.map((d) => (
        <RepositoryDiffView key={d.repositoryId} diff={d} />
      ))}
    </div>
  );
}

function RepositoryDiffView({ diff: d }: { diff: RepositoryDiff }) {
  return (
    <section className="flex flex-col gap-2" aria-label={`Diff for ${d.repositoryName}`}>
      <header className="text-sm">
        <span className="font-medium">{d.repositoryName}</span>{" "}
        <span className="font-mono text-xs text-neutral-500">
          {d.branch} ← {d.baseBranch}
          {d.mergeBase ? ` @ ${d.mergeBase.slice(0, 7)}` : ""}
        </span>
        {d.shortStat && <p className="text-xs text-neutral-500">{d.shortStat}</p>}
      </header>

      {!d.worktreeExists ? (
        <p className="text-sm text-neutral-400">
          No worktree yet — this task has not run on this repository.
        </p>
      ) : d.error ? (
        <p className="text-sm text-red-600">{d.error}</p>
      ) : (
        <>
          {d.diff ? (
            <DiffText text={d.diff} />
          ) : (
            <p className="text-sm text-neutral-400">No changes to tracked files.</p>
          )}
          {d.truncated && (
            <p className="text-xs text-amber-700">
              The diff is too large and was cut short.
            </p>
          )}
          {d.untrackedFiles.length > 0 && (
            <div className="text-xs text-neutral-600">
              <p className="font-medium">Untracked files (not in the diff):</p>
              <ul className="ml-4 list-disc font-mono">
                {d.untrackedFiles.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function lineClass(line: string): string {
  if (line.startsWith("diff --git")) return "mt-2 bg-neutral-200 font-semibold text-neutral-800";
  if (line.startsWith("+++") || line.startsWith("---")) return "text-neutral-600";
  if (line.startsWith("@@")) return "bg-sky-50 text-sky-700";
  if (line.startsWith("+")) return "bg-green-50 text-green-800";
  if (line.startsWith("-")) return "bg-red-50 text-red-800";
  return "text-neutral-700";
}

function DiffText({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded border border-neutral-200 text-xs leading-5">
      {text.split("\n").map((line, i) => (
        <div key={i} className={"px-2 " + lineClass(line)}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}
