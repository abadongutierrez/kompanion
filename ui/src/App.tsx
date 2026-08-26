import { useQuery } from "@tanstack/react-query";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api.js";
import { ProjectsPage } from "./components/ProjectsPage.js";
import { ProjectShell } from "./components/ProjectShell.js";
import { AgentsLibraryPage } from "./components/AgentsLibraryPage.js";
import { TaskPage } from "./components/TaskPage.js";

export function App() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">SDLC Kompanion</h1>
          <nav className="flex gap-3 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? "font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
              }
            >
              Projects
            </NavLink>
            <NavLink
              to="/agents"
              className={({ isActive }) =>
                isActive ? "font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
              }
            >
              Agents
            </NavLink>
          </nav>
        </div>
        <HeartbeatIndicator />
      </header>

      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/agents" element={<AgentsLibraryPage />} />
        <Route path="/projects/:projectId/tasks/:taskId" element={<TaskPage />} />
        <Route path="/projects/:projectId/:section?" element={<ProjectShell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
