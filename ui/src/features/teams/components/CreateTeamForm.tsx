import { useState } from "react";
import type { Team } from "@kompanion/shared";
import { Button, TextInput } from "@/shared/ui/index.js";
import { useCreateTeam } from "../hooks.js";

export function CreateTeamForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (team: Team) => void;
}) {
  const [name, setName] = useState("");
  const createTeam = useCreateTeam(projectId);

  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        createTeam.mutate({ name }, { onSuccess: onCreated });
      }}
    >
      <h2 className="text-base font-medium">Create a Team</h2>
      <TextInput
        density="md"
        placeholder="Team name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button type="submit" density="md" disabled={createTeam.isPending}>
        Create
      </Button>
    </form>
  );
}
