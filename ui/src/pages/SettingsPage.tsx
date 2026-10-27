import { Muted } from "@/shared/ui/index.js";
import { AddRuntimeForm, RuntimeRow, useRuntimes } from "@/features/runtimes/index.js";

// App settings. Runtimes only for now: the agent CLIs this machine can run,
// and how to launch each (binary, and for Claude Code a config directory so
// several accounts can coexist). Agents pick one on their own form.
export function SettingsPage() {
  const runtimes = useRuntimes();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <Muted>
          Runtimes are the agent CLIs Kompanion can launch. Add more than one Claude Code
          with different config directories to use several accounts. Pick a runtime on
          an Agent&apos;s edit page.
        </Muted>
      </div>

      <AddRuntimeForm />

      {runtimes.isError && (
        <p className="text-sm text-neutral-600">Could not load the runtimes.</p>
      )}
      {(runtimes.data ?? []).length === 0 ? (
        runtimes.data && <Muted>No runtimes yet. Agents use the CLIs on PATH.</Muted>
      ) : (
        <ul className="space-y-2">
          {(runtimes.data ?? []).map((runtime) => (
            <RuntimeRow key={runtime.id} runtime={runtime} />
          ))}
        </ul>
      )}
    </main>
  );
}
