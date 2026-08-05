import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { CreateTeamForm } from "./CreateTeamForm.js";
import { TaskBoard } from "./TaskBoard.js";
import { RolesPanel } from "./RolesPanel.js";
import { RepositoriesPanel } from "./RepositoriesPanel.js";
import { BudgetPanel } from "./BudgetPanel.js";
import { Sidebar, type Section } from "./Sidebar.js";

const VALID_SECTIONS: Section[] = ["board", "roles", "repositories", "budget"];

// The per-project app shell: everything App.tsx used to render once it had
// silently picked a project. Team selection is unchanged from before
// (auto-select the first team, or offer to create one) — only project
// switching moved to real routing; a team switcher is a separate,
// not-yet-built concern.
export function ProjectShell() {
  const { projectId, section: sectionParam } = useParams<{
    projectId: string;
    section?: string;
  }>();
  const section: Section = VALID_SECTIONS.includes(sectionParam as Section)
    ? (sectionParam as Section)
    : "board";

  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const project = projects.data?.find((p) => p.id === projectId);

  const teams = useQuery({
    queryKey: ["teams", projectId],
    queryFn: () => api.listTeams(projectId!),
    enabled: !!projectId,
  });
  const teamId = teams.data?.[0]?.id ?? null;

  if (projects.data && !project) {
    return (
      <main className="mx-auto max-w-xl px-6 py-8">
        <p className="text-sm text-neutral-600">
          Project not found.{" "}
          <Link className="underline" to="/">
            Back to Projects
          </Link>
        </p>
      </main>
    );
  }

  return (
    <div>
      <div className="border-b border-neutral-200 bg-white px-6 py-2">
        <Link to="/" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Projects
        </Link>
        {project && <p className="text-sm font-medium">{project.name}</p>}
      </div>

      {projectId && teams.data && teams.data.length === 0 && (
        <main className="mx-auto max-w-6xl px-6 py-8">
          <CreateTeamForm projectId={projectId} onCreated={() => {}} />
        </main>
      )}

      {projectId && teamId && (
        <div className="flex">
          <Sidebar projectId={projectId} />
          <main className="min-w-0 flex-1 px-6 py-8">
            {section === "board" && <TaskBoard teamId={teamId} projectId={projectId} />}
            {section === "roles" && <RolesPanel teamId={teamId} />}
            {section === "repositories" && <RepositoriesPanel projectId={projectId} />}
            {section === "budget" && <BudgetPanel teamId={teamId} />}
          </main>
        </div>
      )}
    </div>
  );
}
