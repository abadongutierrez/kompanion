import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@kompanion/shared";
import { api } from "../api.js";

// The app-wide Agent library — a root-level page like Projects, reachable
// from anywhere via the header nav, not nested inside any specific
// project/team. Agents are created and edited here; a Team's own Agents
// page (inside a project) only handles assigning/unassigning them.
export function AgentsLibraryPage() {
  const queryClient = useQueryClient();
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [harnessPath, setHarnessPath] = useState("");
  const [harnessTemplate, setHarnessTemplate] = useState("");

  const agents = useQuery({ queryKey: ["allAgents"], queryFn: api.listAllAgents });

  function resetForm() {
    setEditingAgentId(null);
    setTitle("");
    setSlug("");
    setHarnessPath("");
    setHarnessTemplate("");
  }

  async function startEditing(agent: Agent) {
    setEditingAgentId(agent.id);
    setTitle(agent.title);
    setSlug(agent.slug);
    setHarnessPath(agent.harnessPath);
    const template = await api.getHarnessTemplate(agent.id);
    setHarnessTemplate(template.content);
  }

  const saveAgent = useMutation({
    mutationFn: async () => {
      if (editingAgentId) {
        const [agent] = await Promise.all([
          api.updateAgent(editingAgentId, { title, slug, harnessPath }),
          api.updateHarnessTemplate(editingAgentId, harnessTemplate),
        ]);
        return agent;
      }
      return api.createAgent({ title, harnessPath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allAgents"] });
      resetForm();
    },
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h2 className="text-lg font-semibold">Agents</h2>
        <p className="text-sm text-neutral-500">
          The app-wide agent library. Assign agents to a team from within a project's
          Agents page.
        </p>
      </div>

      {(agents.data ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">No agents yet — create the first one below.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {(agents.data ?? []).map((agent) => (
            <div
              key={agent.id}
              className="space-y-1 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-800">{agent.title}</span>
                <button
                  className="text-xs text-neutral-400 hover:text-neutral-700"
                  onClick={() => startEditing(agent)}
                >
                  Edit
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                slug: <code>{agent.slug}</code>
              </p>
              <p className="break-all text-xs text-neutral-400">
                harness: <code>{agent.harnessPath}</code>
              </p>
            </div>
          ))}
        </div>
      )}

      <form
        className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && harnessPath.trim()) saveAgent.mutate();
        }}
      >
        <h3 className="text-sm font-medium">
          {editingAgentId ? "Edit agent" : "Create a new agent"}
        </h3>
        {editingAgentId && (
          <p className="text-xs text-amber-600">
            This agent is shared — editing it changes what every team it's assigned to
            sees.
          </p>
        )}
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Agent title (e.g. Tech Lead)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {editingAgentId && (
          <input
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            placeholder="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        )}
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Harness folder path"
          value={harnessPath}
          onChange={(e) => setHarnessPath(e.target.value)}
        />
        {editingAgentId && (
          <textarea
            className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
            placeholder="Harness template (CLAUDE.md)"
            rows={10}
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
            {editingAgentId ? "Save changes" : "Create agent"}
          </button>
          {editingAgentId && (
            <button
              type="button"
              className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
              onClick={resetForm}
            >
              Cancel
            </button>
          )}
        </div>

        {saveAgent.isError && (
          <p className="text-xs text-red-600">{(saveAgent.error as Error).message}</p>
        )}
      </form>
    </main>
  );
}
