import { useState } from "react";
import { Button, Card, ErrorText, Muted, TextInput } from "@/shared/ui/index.js";
import {
  SkillRow,
  useRegisterSkill,
  useScanSkills,
  useSkills,
} from "@/features/skills/index.js";

// The app-wide skills library — a root-level page like Agents. A skill is a
// folder on disk (SKILL.md plus files); this page only points the app at
// folders and shows what it found. Teaching a skill to an Agent happens on the
// Agent's own form.
export function SkillsLibraryPage() {
  const skills = useSkills();
  const register = useRegisterSkill();
  const scan = useScanSkills();
  const [path, setPath] = useState("");

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h2 className="text-lg font-semibold">Skills</h2>
        <Muted>
          Skills are folders with a SKILL.md. Register one by path, or scan the library's
          skills folder for new ones. Teach them to an Agent on its edit page.
        </Muted>
      </div>

      <Card
        as="form"
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!path.trim()) return;
          register.mutate(path.trim(), { onSuccess: () => setPath("") });
        }}
      >
        <div className="flex gap-2">
          <TextInput
            aria-label="Skill folder path"
            placeholder="Skill folder (e.g. skills/handoff, or an absolute path)"
            fullWidth={false}
            className="min-w-0 flex-1"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <Button type="submit" disabled={register.isPending}>
            Register
          </Button>
          <Button
            variant="secondary"
            disabled={scan.isPending}
            onClick={() => scan.mutate()}
          >
            Scan library
          </Button>
        </div>
        {register.isError && <ErrorText>{(register.error as Error).message}</ErrorText>}
        {scan.isError && <ErrorText>{(scan.error as Error).message}</ErrorText>}
        {scan.data && (
          <Muted size="xs" role="status">
            Scan done: {scan.data.registered.length} registered,{" "}
            {scan.data.refreshed.length} refreshed, {scan.data.broken.length} broken.
          </Muted>
        )}
      </Card>

      {skills.isError && (
        <p className="text-sm text-neutral-600">Could not load the skills library.</p>
      )}

      {(skills.data ?? []).length === 0 ? (
        skills.data && <Muted>No skills registered yet.</Muted>
      ) : (
        <ul className="space-y-2">
          {(skills.data ?? []).map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </ul>
      )}
    </main>
  );
}
