import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { HeartbeatIndicator } from "@/features/system/index.js";
import { ProjectsPage } from "@/pages/ProjectsPage.js";
import { ProjectShell } from "@/pages/ProjectShell.js";
import { AgentsLibraryPage } from "@/pages/AgentsLibraryPage.js";
import { AgentFormPage } from "@/pages/AgentFormPage.js";
import { SkillsLibraryPage } from "@/pages/SkillsLibraryPage.js";
import { TaskPage } from "@/pages/TaskPage.js";

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
            <NavLink
              to="/skills"
              className={({ isActive }) =>
                isActive ? "font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
              }
            >
              Skills
            </NavLink>
          </nav>
        </div>
        <HeartbeatIndicator />
      </header>

      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/agents" element={<AgentsLibraryPage />} />
        {/* Keyed by mode so moving between New, Edit and View remounts the
            form: otherwise React reuses it and View could show an unsaved
            Edit draft instead of the saved Agent. */}
        <Route path="/agents/new" element={<AgentFormPage key="create" mode="create" />} />
        <Route path="/agents/:agentId" element={<AgentFormPage key="edit" mode="edit" />} />
        <Route path="/agents/:agentId/view" element={<AgentFormPage key="view" mode="view" />} />
        <Route path="/skills" element={<SkillsLibraryPage />} />
        <Route path="/projects/:projectId/tasks/:taskId" element={<TaskPage />} />
        <Route path="/projects/:projectId/:section?" element={<ProjectShell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
