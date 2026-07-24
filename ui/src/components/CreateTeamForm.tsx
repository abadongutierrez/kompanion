import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Team } from "@sdlc/shared";
import { api } from "../api.js";

export function CreateTeamForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (team: Team) => void;
}) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.createTeam({ projectId, name }),
    onSuccess: (team) => {
      queryClient.invalidateQueries({ queryKey: ["teams", projectId] });
      onCreated(team);
    },
  });

  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) mutation.mutate();
      }}
    >
      <h2 className="text-base font-medium">Create a Team</h2>
      <input
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Team name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="submit"
        className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        disabled={mutation.isPending}
      >
        Create
      </button>
    </form>
  );
}
