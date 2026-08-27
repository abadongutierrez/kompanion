import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AGENT_RUNTIME_LABEL,
  type Agent,
  type AgentRuntime,
} from "@kompanion/shared";
import { api } from "../api.js";

// Creating and editing an agent each get their own route — /agents/new and
// /agents/:agentId — instead of the single form that used to sit under the
// library list. Both modes render this one page: the fields are the same,
// only slug and the harness template are edit-only (a slug is derived from
// the title on create, and the template lives at a path keyed by agent id,
// so neither exists yet while creating).
export function AgentFormPage({ mode }: { mode: "create" | "edit" }) {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";

  // There is no single-agent endpoint; the library list is the app's source
  // of truth for an agent, same as TaskPage reads its task out of the task
  // list.
  const agents = useQuery({ queryKey: ["allAgents"], queryFn: api.listAllAgents });
  const agent = isEdit ? agents.data?.find((a) => a.id === agentId) : undefined;

  const template = useQuery({
    queryKey: ["harnessTemplate", agentId],
    queryFn: () => api.getHarnessTemplate(agentId!),
    enabled: isEdit && !!agentId,
  });

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

  const saveAgent = useMutation({
    mutationFn: async (): Promise<Agent> => {
      if (isEdit && agentId) {
        const [saved] = await Promise.all([
          api.updateAgent(agentId, { title, slug, harnessPath, runtime, model }),
          api.updateHarnessTemplate(agentId, harnessTemplate),
        ]);
        return saved;
      }
      return api.createAgent({ title, harnessPath, runtime, model });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allAgents"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["harnessTemplate", agentId] });
      navigate("/agents");
    },
  });

  const backToLibrary = (
    <Link to="/agents" className="text-xs text-neutral-500 hover:text-neutral-700">
      ← Agents
    </Link>
  );

  // A bad /agents/:agentId URL (or an agent that no longer exists) resolves
  // to no agent once the list has loaded — say so instead of showing an
  // empty form that would silently save nothing.
  if (isEdit && agents.data && !agent) {
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
          {agents.isError ? "Could not load this agent." : "Loading…"}
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
          <p className="text-sm text-neutral-500">
            Agents are app-wide. After creating one, assign it to a team from that
            project's Agents page.
          </p>
        )}
      </div>

      <form
        className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && harnessPath.trim()) saveAgent.mutate();
        }}
      >
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Agent title (e.g. Tech Lead)"
          aria-label="Agent title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {isEdit && (
          <input
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            placeholder="Slug"
            aria-label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        )}
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Harness folder path"
          aria-label="Harness folder path"
          value={harnessPath}
          onChange={(e) => setHarnessPath(e.target.value)}
        />
        <div className="flex gap-2">
          <select
            aria-label="Runtime"
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
            value={runtime}
            onChange={(e) => setRuntime(e.target.value as AgentRuntime)}
          >
            {Object.entries(AGENT_RUNTIME_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label="Model"
            className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
            placeholder={
              runtime === "opencode"
                ? "Model (optional, e.g. ollama/qwen2.5-coder:7b)"
                : "Model (optional, e.g. claude-opus-5)"
            }
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
        {isEdit && (
          <textarea
            className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
            aria-label="Harness template"
            placeholder={
              runtime === "opencode"
                ? "Harness template (AGENTS.md)"
                : "Harness template (CLAUDE.md)"
            }
            rows={16}
            value={harnessTemplate}
            onChange={(e) => setHarnessTemplate(e.target.value)}
          />
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
            disabled={saveAgent.isPending}
          >
            {isEdit ? "Save changes" : "Create agent"}
          </button>
          <Link
            to="/agents"
            className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
          >
            Cancel
          </Link>
        </div>

        {saveAgent.isError && (
          <p className="text-xs text-red-600">{(saveAgent.error as Error).message}</p>
        )}
      </form>
    </main>
  );
}
