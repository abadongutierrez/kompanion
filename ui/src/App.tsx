import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";
import { CreateProjectForm } from "./components/CreateProjectForm.js";
import { CreateTeamForm } from "./components/CreateTeamForm.js";
import { TaskBoard } from "./components/TaskBoard.js";
import { RolesPanel } from "./components/RolesPanel.js";
import { RepositoriesPanel } from "./components/RepositoriesPanel.js";
import { BudgetPanel } from "./components/BudgetPanel.js";
import { Sidebar, type Section } from "./components/Sidebar.js";

export function App() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("board");

  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const activeProjectId = projectId ?? projects.data?.[0]?.id ?? null;

  const teams = useQuery({
    queryKey: ["teams", activeProjectId],
    queryFn: () => api.listTeams(activeProjectId!),
    enabled: !!activeProjectId,
  });

  const activeTeamId = teamId ?? teams.data?.[0]?.id ?? null;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">SDLC Paperclip</h1>
          <p className="text-sm text-neutral-500">
            Project → Team → Role → Task
          </p>
        </div>
        <HeartbeatIndicator />
      </header>

      {!activeProjectId && (
        <main className="mx-auto max-w-6xl px-6 py-8">
          <CreateProjectForm onCreated={(project) => setProjectId(project.id)} />
        </main>
      )}

      {activeProjectId && !activeTeamId && (
        <main className="mx-auto max-w-6xl px-6 py-8">
          <CreateTeamForm
            projectId={activeProjectId}
            onCreated={(team) => setTeamId(team.id)}
          />
        </main>
      )}

      {activeProjectId && activeTeamId && (
        <div className="flex">
          <Sidebar active={section} onSelect={setSection} />
          <main className="min-w-0 flex-1 px-6 py-8">
            {section === "board" && (
              <TaskBoard teamId={activeTeamId} projectId={activeProjectId} />
            )}
            {section === "roles" && <RolesPanel teamId={activeTeamId} />}
            {section === "repositories" && (
              <RepositoriesPanel projectId={activeProjectId} />
            )}
            {section === "budget" && <BudgetPanel teamId={activeTeamId} />}
          </main>
        </div>
      )}
    </div>
  );
}

function HeartbeatIndicator() {
  const status = useQuery({
    queryKey: ["heartbeatStatus"],
    queryFn: api.getHeartbeatStatus,
    refetchInterval: 10_000,
  });

  if (!status.data) return null;

  if (!status.data.enabled) {
    return <span className="text-xs text-neutral-400">Heartbeats: off</span>;
  }

  const lastTick = status.data.lastTickAt
    ? new Date(status.data.lastTickAt).toLocaleTimeString()
    : "never";

  return (
    <span className="text-xs text-neutral-500">
      Heartbeats: on — every {Math.round(status.data.intervalMs / 1000)}s
      <br />
      last tick {lastTick}
      {status.data.lastRunTaskId && ` — ran task ${status.data.lastRunTaskId.slice(0, 8)}`}
    </span>
  );
}
