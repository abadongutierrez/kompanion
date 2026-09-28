import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useProject } from "@/features/projects/index.js";
import { Sidebar } from "./Sidebar.js";

// The per-project frame: the "← Projects / <project name>" bar and the
// section sidebar. Extracted from ProjectShell so a page routed outside the
// shell — the task page, which lives at /projects/:id/tasks/:taskId rather
// than under :section — still sits in the same frame as every other project
// page instead of floating on a bare header.
//
// None of the sidebar's four links matches the task route, so nothing is
// highlighted while a task is open. That's deliberate: a task isn't one of
// the sections, and marking Board active would claim a location the URL
// doesn't back up.
export function ProjectChrome({
  projectId,
  // The one case with no sidebar: a project whose team doesn't exist yet has
  // no section to navigate to, so ProjectShell renders the create-team form
  // against the bare frame.
  withSidebar = true,
  children,
}: {
  projectId: string;
  withSidebar?: boolean;
  children: ReactNode;
}) {
  const { data: project } = useProject(projectId);

  return (
    <div>
      <div className="border-b border-neutral-200 bg-white px-6 py-2">
        <Link to="/" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Projects
        </Link>
        {project && <p className="text-sm font-medium">{project.name}</p>}
      </div>

      {withSidebar ? (
        <div className="flex">
          <Sidebar projectId={projectId} />
          <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
        </div>
      ) : (
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      )}
    </div>
  );
}
