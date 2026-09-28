import { Link, useParams } from "react-router-dom";
import { ProjectChrome } from "@/app/layouts/ProjectChrome.js";
import { type Section } from "@/app/layouts/Sidebar.js";
import { useProject } from "@/features/projects/index.js";
import { CreateTeamForm, useCurrentTeamId } from "@/features/teams/index.js";
import { RepositoriesPanel } from "@/features/repositories/index.js";
import { AgentsPanel } from "@/features/agents/index.js";
import { BudgetPanel } from "@/features/budget/index.js";
import { TaskBoard } from "@/features/tasks/index.js";



import { Muted } from "@/shared/ui/index.js";

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

  const project = useProject(projectId);
  const { data: teams, teamId } = useCurrentTeamId(projectId);

  // isSuccess means the project list came back; no match in a list that
  // loaded is a real 404, not a pending state.
  if (project.isSuccess && !project.data) {
    return (
      <main className="mx-auto max-w-xl px-6 py-8">
        <Muted>
          Project not found.{" "}
          <Link className="underline" to="/">
            Back to Projects
          </Link>
        </Muted>
      </main>
    );
  }

  if (!projectId) return null;

  if (teams && teams.length === 0) {
    return (
      <ProjectChrome projectId={projectId} withSidebar={false}>
        <CreateTeamForm projectId={projectId} onCreated={() => {}} />
      </ProjectChrome>
    );
  }

  return (
    <ProjectChrome projectId={projectId}>
      {/* Budget is project-scoped — it rolls up every team — so it must not
          wait on the first team resolving the way the team-scoped panels do. */}
      {section === "budget" && <BudgetPanel projectId={projectId} />}
      {teamId && (
        <>
          {section === "board" && <TaskBoard teamId={teamId} projectId={projectId} />}
          {section === "agents" && <AgentsPanel teamId={teamId} />}
          {section === "repositories" && <RepositoriesPanel projectId={projectId} />}
        </>
      )}
    </ProjectChrome>
  );
}
