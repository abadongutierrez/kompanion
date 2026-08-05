import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api.js";
import { CreateProjectForm } from "./CreateProjectForm.js";

// The root landing page — always shown at "/", regardless of how many
// projects exist or which one was last visited. Unlike the old
// auto-select-the-first-one behavior, switching projects should be a
// deliberate, visible action.
export function ProjectsPage() {
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <div>
        <h2 className="text-lg font-semibold">Projects</h2>
        <p className="text-sm text-neutral-500">Pick a project to open its board.</p>
      </div>

      {projects.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {projects.data && projects.data.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
          {projects.data.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}/board`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
              >
                <span className="font-medium">{project.name}</span>
                <span className="text-xs text-neutral-400">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {projects.data && projects.data.length === 0 && (
        <p className="text-sm text-neutral-500">No projects yet — create the first one below.</p>
      )}

      <CreateProjectForm
        onCreated={(project) => navigate(`/projects/${project.id}/board`)}
      />
    </main>
  );
}
