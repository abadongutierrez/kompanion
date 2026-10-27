import { useState } from "react";
import { AGENT_RUNTIME_LABEL, type Runtime } from "@kompanion/shared";
import { Button, Card, ErrorText, Muted, TextInput } from "@/shared/ui/index.js";
import { useDeleteRuntime, useTestRuntime, useUpdateRuntime } from "../hooks.js";

// One configured runtime on the Settings page: view, edit in place, test, delete.
export function RuntimeRow({ runtime }: { runtime: Runtime }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(runtime.name);
  const [binaryPath, setBinaryPath] = useState(runtime.binaryPath ?? "");
  const [configDir, setConfigDir] = useState(runtime.configDir ?? "");
  const update = useUpdateRuntime();
  const remove = useDeleteRuntime();
  const test = useTestRuntime();
  const isClaude = runtime.kind === "claude_code";

  return (
    <Card tone="soft" as="li" className="space-y-2" data-testid={`runtime-${runtime.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{runtime.name}</span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
              {AGENT_RUNTIME_LABEL[runtime.kind]}
            </span>
          </div>
          <Muted size="xs">
            Binary: <code>{runtime.binaryPath ?? "default (PATH)"}</code>
          </Muted>
          {isClaude && (
            <Muted size="xs">
              Config dir: <code>{runtime.configDir ?? "default (~/.claude)"}</code>
            </Muted>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            disabled={test.isPending}
            onClick={() => test.mutate(runtime.id)}
          >
            Test
          </Button>
          <Button variant="secondary" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button
            variant="secondary"
            disabled={remove.isPending}
            onClick={() => remove.mutate(runtime.id)}
          >
            Delete
          </Button>
        </div>
      </div>

      {test.data && (
        <p
          role="status"
          className={test.data.ok ? "text-xs text-green-700" : "text-xs text-red-700"}
        >
          {test.data.ok ? "OK — " : "Failed — "}
          {test.data.message}
        </p>
      )}
      {test.isError && <ErrorText>{(test.error as Error).message}</ErrorText>}
      {remove.isError && <ErrorText>{(remove.error as Error).message}</ErrorText>}

      {editing && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(
              {
                runtimeId: runtime.id,
                // Blank clears; the server treats null as "leave alone".
                input: { name, binaryPath, ...(isClaude ? { configDir } : {}) },
              },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <TextInput aria-label="Runtime name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput
            aria-label="Binary path"
            placeholder="Binary path (blank = default)"
            value={binaryPath}
            onChange={(e) => setBinaryPath(e.target.value)}
          />
          {isClaude && (
            <TextInput
              aria-label="Config directory"
              placeholder="Config directory (blank = ~/.claude)"
              value={configDir}
              onChange={(e) => setConfigDir(e.target.value)}
            />
          )}
          <Button type="submit" disabled={update.isPending}>
            Save
          </Button>
          {update.isError && <ErrorText>{(update.error as Error).message}</ErrorText>}
        </form>
      )}
    </Card>
  );
}
