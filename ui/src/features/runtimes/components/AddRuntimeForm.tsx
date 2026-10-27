import { useState } from "react";
import { AGENT_RUNTIME_LABEL, type AgentRuntime } from "@kompanion/shared";
import { Button, Card, ErrorText, Select, TextInput } from "@/shared/ui/index.js";
import { useCreateRuntime } from "../hooks.js";

// Only Claude Code has a config directory today; the field shows for it alone.
export function AddRuntimeForm() {
  const create = useCreateRuntime();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AgentRuntime>("claude_code");
  const [binaryPath, setBinaryPath] = useState("");
  const [configDir, setConfigDir] = useState("");

  return (
    <Card
      as="form"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        create.mutate(
          {
            name,
            kind,
            binaryPath: binaryPath.trim() || null,
            configDir: kind === "claude_code" ? configDir.trim() || null : null,
          },
          {
            onSuccess: () => {
              setName("");
              setBinaryPath("");
              setConfigDir("");
            },
          },
        );
      }}
    >
      <div className="flex gap-2">
        <Select
          aria-label="Runtime kind"
          fullWidth={false}
          value={kind}
          onChange={(e) => setKind(e.target.value as AgentRuntime)}
        >
          {Object.entries(AGENT_RUNTIME_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <TextInput
          aria-label="Runtime name"
          placeholder="Name (e.g. Claude work)"
          fullWidth={false}
          className="min-w-0 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <TextInput
        aria-label="Binary path"
        placeholder="Binary path (optional — defaults to the command on PATH)"
        value={binaryPath}
        onChange={(e) => setBinaryPath(e.target.value)}
      />
      {kind === "claude_code" && (
        <TextInput
          aria-label="Config directory"
          placeholder="Config directory (optional, e.g. ~/.claude-work)"
          value={configDir}
          onChange={(e) => setConfigDir(e.target.value)}
        />
      )}
      <Button type="submit" disabled={create.isPending}>
        Add runtime
      </Button>
      {create.isError && <ErrorText>{(create.error as Error).message}</ErrorText>}
    </Card>
  );
}
