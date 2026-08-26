import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { CreateTeamForm } from "./CreateTeamForm.js";
import { TaskBoard } from "./TaskBoard.js";
import { AgentsPanel } from "./AgentsPanel.js";
import { RepositoriesPanel } from "./RepositoriesPanel.js";
import { BudgetPanel } from "./BudgetPanel.js";
import { ProjectChrome } from "./ProjectChrome.js";
import { type Section } from "./Sidebar.js";

const VALID_SECTIONS: Section[] = ["board", "agents", "repositories", "budget"];

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

  // Still needed for the not-found branch below; ProjectChrome runs the same
  // cached query for the header name.
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

  if (!projectId) return null;

  if (teams.data && teams.data.length === 0) {
    return (
      <ProjectChrome projectId={projectId} withSidebar={false}>
        <CreateTeamForm projectId={projectId} onCreated={() => {}} />
      </ProjectChrome>
    );
  }

  return (
    <ProjectChrome projectId={projectId}>
      {teamId && (
        <>
          {section === "board" && <TaskBoard teamId={teamId} projectId={projectId} />}
          {section === "agents" && <AgentsPanel teamId={teamId} />}
          {section === "repositories" && <RepositoriesPanel projectId={projectId} />}
          {section === "budget" && <BudgetPanel teamId={teamId} />}
        </>
      )}
    </ProjectChrome>
  );
}
