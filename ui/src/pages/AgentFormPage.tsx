import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AGENT_RUNTIME_LABEL, type AgentRuntime } from "@kompanion/shared";
import {
  Button,
  Card,
  ErrorText,
  Muted,
  Select,
  TextArea,
  TextInput,
} from "@/shared/ui/index.js";
import {
  useAgent,
  useHarnessTemplate,
  useSaveAgent,
} from "@/features/agents/index.js";

// Example ids, not validation: models are free text because every CLI names
// them differently.
const MODEL_PLACEHOLDER: Record<AgentRuntime, string> = {
  claude_code: "Model (optional, e.g. claude-opus-5)",
  opencode: "Model (optional, e.g. ollama/qwen2.5-coder:7b)",
  pi: "Model (optional, e.g. lmstudio/qwen3.8-27b)",
};

// Which file in the harness folder this text becomes the system prompt from.
// The endpoint behind it always reads and writes CLAUDE.md; the runtimes that
// prefer AGENTS.md fall back to CLAUDE.md, so one template still serves all
// three.
const HARNESS_TEMPLATE_PLACEHOLDER: Record<AgentRuntime, string> = {
  claude_code: "Harness template (CLAUDE.md)",
  opencode: "Harness template (AGENTS.md)",
  pi: "Harness template (AGENTS.md)",
};

// Creating and editing an agent each get their own route — /agents/new and
// /agents/:agentId — instead of the single form that used to sit under the
// library list. Both modes render this one page: the fields are the same,
// only slug and the harness template are edit-only (a slug is derived from
// the title on create, and the template lives at a path keyed by agent id,
// so neither exists yet while creating).
export function AgentFormPage({ mode }: { mode: "create" | "edit" }) {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const agentQuery = useAgent(isEdit ? agentId : undefined);
  const agent = agentQuery.data;
  const template = useHarnessTemplate(isEdit ? agentId : undefined);
  const saveAgent = useSaveAgent(isEdit ? agentId : undefined);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [harnessPath, setHarnessPath] = useState("");
  const [runtime, setRuntime] = useState<AgentRuntime>("claude_code");
  const [model, setModel] = useState("");
  const [harnessTemplate, setHarnessTemplate] = useState("");

  // Seed the fields once the agent (and its template) arrive. Keyed on the
  // id so the form refills when navigating straight from one agent's edit
  // page to another's, but not on every refetch of the library list — that
  // would throw away whatever is being typed.
  useEffect(() => {
    if (!agent) return;
    setTitle(agent.title);
    setSlug(agent.slug);
    setHarnessPath(agent.harnessPath);
    setRuntime(agent.runtime);
    setModel(agent.model ?? "");
  }, [agent?.id]);

  useEffect(() => {
    if (template.data) setHarnessTemplate(template.data.content);
  }, [template.data]);

  const backToLibrary = (
    <Link to="/agents" className="text-xs text-neutral-500 hover:text-neutral-700">
      ← Agents
    </Link>
  );

  // A bad /agents/:agentId URL (or an agent that no longer exists) resolves
  // to no agent once the list has loaded — say so instead of showing an
  // empty form that would silently save nothing.
  if (isEdit && agentQuery.isSuccess && !agent) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 px-6 py-8">
        {backToLibrary}
        <p className="text-sm text-neutral-600">Agent not found.</p>
      </main>
    );
  }

  if (isEdit && !agent) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 px-6 py-8">
        {backToLibrary}
        <p className="text-sm text-neutral-400">
          {agentQuery.isError ? "Could not load this agent." : "Loading…"}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-8">
      {backToLibrary}

      <div>
        <h2 className="text-lg font-semibold">{isEdit ? "Edit agent" : "New agent"}</h2>
        {isEdit ? (
          <p className="text-sm text-amber-600">
            This agent is shared — editing it changes what every team it's assigned to
            sees.
          </p>
        ) : (
          <Muted>
            Agents are app-wide. After creating one, assign it to a team from that
            project's Agents page.
          </Muted>
        )}
      </div>

      <Card
        as="form"
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !harnessPath.trim()) return;
          saveAgent.mutate(
            {
              values: { title, slug, harnessPath, runtime, model },
              harnessTemplate,
            },
            { onSuccess: () => navigate("/agents") },
          );
        }}
      >
        <TextInput
          placeholder="Agent title (e.g. Tech Lead)"
          aria-label="Agent title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {isEdit && (
          <TextInput
            placeholder="Slug"
            aria-label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        )}
        <TextInput
          placeholder="Harness folder path"
          aria-label="Harness folder path"
          value={harnessPath}
          onChange={(e) => setHarnessPath(e.target.value)}
        />
        <div className="flex gap-2">
          <Select
            aria-label="Runtime"
            fullWidth={false}
            value={runtime}
            onChange={(e) => setRuntime(e.target.value as AgentRuntime)}
          >
            {Object.entries(AGENT_RUNTIME_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <TextInput
            aria-label="Model"
            fullWidth={false}
            className="min-w-0 flex-1"
            placeholder={MODEL_PLACEHOLDER[runtime]}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
        {isEdit && (
          <TextArea
            className="font-mono text-xs"
            aria-label="Harness template"
            placeholder={HARNESS_TEMPLATE_PLACEHOLDER[runtime]}
            rows={16}
            value={harnessTemplate}
            onChange={(e) => setHarnessTemplate(e.target.value)}
          />
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={saveAgent.isPending}>
            {isEdit ? "Save changes" : "Create agent"}
          </Button>
          <Link
            to="/agents"
            className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
          >
            Cancel
          </Link>
        </div>

        {saveAgent.isError && (
          <ErrorText>{(saveAgent.error as Error).message}</ErrorText>
        )}
      </Card>
    </main>
  );
}
