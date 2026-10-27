import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AGENT_RUNTIME_LABEL, type AgentRuntime } from "@kompanion/shared";
import { useRuntimes } from "@/features/runtimes/index.js";
import {
  Button,
  Card,
  ErrorText,
  Muted,
  SectionHeading,
  Select,
  TextArea,
  TextInput,
} from "@/shared/ui/index.js";
import {
  useAgent,
  useHarnessTemplate,
  useSaveAgent,
} from "@/features/agents/index.js";
import {
  SkillPicker,
  useAgentSkills,
  useAssignSkills,
  useSkills,
} from "@/features/skills/index.js";

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
//
// View mode (/agents/:agentId/view) is edit mode with every field locked
// and no Save: it loads and shows exactly what Edit shows, so the two can't
// drift apart.
export function AgentFormPage({ mode }: { mode: "create" | "edit" | "view" }) {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const isView = mode === "view";
  const isEdit = mode === "edit" || isView;
  // Text fields are read-only rather than disabled in View, so they can still
  // be focused and scrolled from the keyboard (a long harness template runs
  // past its 16 rows). The shading says they can't be changed.
  const readOnlyProps = isView ? { readOnly: true, className: "bg-neutral-100" } : {};

  const agentQuery = useAgent(isEdit ? agentId : undefined);
  const agent = agentQuery.data;
  const template = useHarnessTemplate(isEdit ? agentId : undefined);
  const saveAgent = useSaveAgent(isEdit ? agentId : undefined);

  // The skills the Agent should learn. The Agent is saved first, and then the
  // whole set is written in one go (the server replaces it), so the form only
  // has to hold the selection.
  const library = useSkills();
  const agentSkills = useAgentSkills(isEdit ? agentId : undefined);
  const assignSkills = useAssignSkills();
  const [skillIds, setSkillIds] = useState<Set<string>>(new Set());

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [harnessPath, setHarnessPath] = useState("");
  const [model, setModel] = useState("");
  const [runtimeId, setRuntimeId] = useState("");
  const runtimes = useRuntimes();
  // The runtime picked on the Settings page decides which CLI runs the Agent,
  // so the kind is read from it rather than chosen separately. Until one is
  // picked, fall back to what the Agent already has (for the placeholders).
  const selectedRuntime = (runtimes.data ?? []).find((r) => r.id === runtimeId);
  const runtime: AgentRuntime = selectedRuntime?.kind ?? agent?.runtime ?? "claude_code";
  // What the Runtime select says while nothing is picked. View never picks one
  // for the Agent, so it says what the Agent runs on instead of prompting for a
  // choice nobody can make there.
  const runtimePlaceholder = runtimes.isError
    ? "Could not load runtimes"
    : isView && agent
      ? `${AGENT_RUNTIME_LABEL[agent.runtime]} (no runtime selected)`
      : runtimes.isSuccess
        ? "Select a runtime"
        : "Loading…";
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
    setModel(agent.model ?? "");
    setRuntimeId(agent.runtimeId ?? "");
  }, [agent?.id]);

  // Nothing picked yet: a new Agent, or one from before runtimes existed. Take
  // the first runtime of the Agent's kind (any, when creating) so saving links
  // it, instead of leaving the operator a blank to fill in. Never for an Agent
  // that already has one: the seeding effect above has queued it, but this
  // closure still sees the empty state and would overwrite it.
  useEffect(() => {
    if (!runtimes.data || runtimeId || isView || agent?.runtimeId) return;
    if (isEdit && !agent) return;
    const match = runtimes.data.find((r) => !agent || r.kind === agent.runtime);
    if (match) setRuntimeId(match.id);
    // runtimeId is a dependency so this reruns after the seeding effect clears
    // it: moving straight from one Agent's edit page to a legacy Agent's would
    // otherwise have run this with the previous Agent's id still in state.
  }, [runtimes.data, agent?.id, runtimeId]);

  useEffect(() => {
    if (template.data) setHarnessTemplate(template.data.content);
  }, [template.data]);

  // Seeded once, when the Agent's skills first arrive — not on every refetch,
  // which would throw away ticks the operator has just made.
  useEffect(() => {
    if (agentSkills.data) setSkillIds(new Set(agentSkills.data.map((a) => a.skill.id)));
  }, [agentSkills.isSuccess, agentId]);

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
        <h2 className="text-lg font-semibold">
          {isView ? agent?.title : isEdit ? "Edit agent" : "New agent"}
        </h2>
        {isView ? (
          <Muted>Read-only view of this agent.</Muted>
        ) : isEdit ? (
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
          if (isView) return;
          if (!title.trim() || !harnessPath.trim() || !selectedRuntime) return;
          saveAgent.mutate(
            {
              values: { title, slug, harnessPath, runtime, model, runtimeId },
              harnessTemplate,
            },
            {
              onSuccess: (saved) => {
                // Writing the set before the Agent's current skills have
                // loaded would un-teach all of them, so an edit waits for
                // them. A create with nothing ticked has nothing to write.
                const canWrite = isEdit ? agentSkills.isSuccess : skillIds.size > 0;
                if (!canWrite) return navigate("/agents");
                assignSkills.mutate(
                  { agentId: saved.id, skillIds: [...skillIds] },
                  { onSuccess: () => navigate("/agents") },
                );
              },
            },
          );
        }}
      >
        <div className="space-y-2">
          <TextInput
            placeholder="Agent title (e.g. Tech Lead)"
            aria-label="Agent title"
            value={title}
            {...readOnlyProps}
            onChange={(e) => setTitle(e.target.value)}
          />
          {isEdit && (
            <TextInput
              placeholder="Slug"
              aria-label="Slug"
              value={slug}
              {...readOnlyProps}
              onChange={(e) => setSlug(e.target.value)}
            />
          )}
          <TextInput
            placeholder="Harness folder path"
            aria-label="Harness folder path"
            value={harnessPath}
            {...readOnlyProps}
            onChange={(e) => setHarnessPath(e.target.value)}
          />
          <div className="flex gap-2">
            <Select
              aria-label="Runtime"
              fullWidth={false}
              disabled={isView}
              value={runtimeId}
              onChange={(e) => setRuntimeId(e.target.value)}
            >
              {!selectedRuntime && (
                <option value="" disabled>
                  {runtimePlaceholder}
                </option>
              )}
              {(runtimes.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({AGENT_RUNTIME_LABEL[r.kind]})
                </option>
              ))}
            </Select>
            <TextInput
              aria-label="Model"
              fullWidth={false}
              className={isView ? "min-w-0 flex-1 bg-neutral-100" : "min-w-0 flex-1"}
              readOnly={isView}
              placeholder={MODEL_PLACEHOLDER[runtime]}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          {runtimes.isError && (
            <ErrorText>
              Could not load the runtimes.{" "}
              <button type="button" className="underline" onClick={() => runtimes.refetch()}>
                Retry
              </button>
            </ErrorText>
          )}
          {runtimes.isSuccess && runtimes.data.length === 0 && (
            <Muted size="xs">
              No runtimes yet. <Link to="/settings" className="underline">Add one in Settings</Link>{" "}
              to choose how this Agent runs.
            </Muted>
          )}
          {isEdit && (
            <TextArea
              className={isView ? "bg-neutral-100 font-mono text-xs" : "font-mono text-xs"}
              readOnly={isView}
              aria-label="Harness template"
              placeholder={HARNESS_TEMPLATE_PLACEHOLDER[runtime]}
              rows={16}
              value={harnessTemplate}
              onChange={(e) => setHarnessTemplate(e.target.value)}
            />
          )}
          <section className="space-y-1 pt-2" aria-labelledby="agent-skills-heading">
            <SectionHeading as="h3" id="agent-skills-heading">
              Skills
            </SectionHeading>
            <Muted size="xs">
              Skills this agent learns. They are added to its working folder on every
              run. Manage the library on the Skills page.
            </Muted>
            {library.isError ? (
              <ErrorText>Could not load the skills library.</ErrorText>
            ) : (
              // A disabled fieldset disables every skill checkbox at once.
              <fieldset disabled={isView}>
                <SkillPicker
                  skills={library.data ?? []}
                  selected={skillIds}
                  onChange={setSkillIds}
                  assigned={agentSkills.data ?? []}
                />
              </fieldset>
            )}
          </section>
        </div>
        {isView ? (
          <div className="flex gap-2">
            <Link
              to={`/agents/${agentId}`}
              className="rounded bg-neutral-900 px-3 py-1 text-xs text-white"
            >
              Edit
            </Link>
            <Link
              to="/agents"
              className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
            >
              Back
            </Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={saveAgent.isPending || assignSkills.isPending || !selectedRuntime}
            >
              {isEdit ? "Save changes" : "Create agent"}
            </Button>
            <Link
              to="/agents"
              className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
            >
              Cancel
            </Link>
          </div>
        )}

        {saveAgent.isError && (
          <ErrorText>{(saveAgent.error as Error).message}</ErrorText>
        )}
        {assignSkills.isError && (
          <ErrorText>
            The agent was saved, but its skills were not: {(assignSkills.error as Error).message}
          </ErrorText>
        )}
      </Card>
    </main>
  );
}
