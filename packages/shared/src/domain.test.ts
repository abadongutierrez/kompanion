import { describe, expect, it } from "vitest";
import {
  AgentSkill,
  AssignSkillsInput,
  RegisterSkillInput,
  RunSkill,
  Skill,
  SKILL_OUTCOME_LABEL,
  SkillDetail,
  SkillOutcome,
  SkillScanResult,
  TaskRun,
} from "./domain.js";

const skill = {
  id: "s1",
  slug: "handoff",
  name: "handoff",
  description: "Use when finishing a task",
  skillPath: "skills/handoff",
  broken: false,
  problem: null,
  createdAt: "2026-10-01T12:00:00Z",
};

const run = {
  id: "r1",
  taskId: "t1",
  agentId: "a1",
  agentTitle: "Engineer",
  runtime: "claude_code",
  model: null,
  status: "succeeded",
  summary: null,
  rawOutput: null,
  costUsd: null,
  durationMs: null,
  inputTokens: null,
  outputTokens: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  instanceHash: "abc123",
  gitSha: "9fceb02",
  gitDirty: false,
  skills: [{ slug: "handoff", hash: "h1", outcome: "loaded" }],
  createdAt: "2026-10-01T12:00:00Z",
};

describe("Skill", () => {
  it("parses a registered skill, and a broken one with its problem", () => {
    expect(Skill.parse(skill).slug).toBe("handoff");
    const broken = Skill.parse({ ...skill, broken: true, problem: 'no folder at "skills/handoff"' });
    expect(broken.broken).toBe(true);
    expect(broken.problem).toContain("no folder");
  });

  it("refuses a skill without a slug or with a non-boolean broken flag", () => {
    expect(Skill.safeParse({ ...skill, slug: undefined }).success).toBe(false);
    expect(Skill.safeParse({ ...skill, broken: "no" }).success).toBe(false);
  });

  it("parses the detail view, with the body present or gone", () => {
    expect(SkillDetail.parse({ skill, body: "# the body" }).body).toBe("# the body");
    expect(SkillDetail.parse({ skill, body: null }).body).toBeNull();
  });

  it("parses a scan result with all three lists", () => {
    const parsed = SkillScanResult.parse({ registered: [skill], refreshed: [], broken: [skill] });
    expect(parsed.registered).toHaveLength(1);
    expect(parsed.refreshed).toHaveLength(0);
  });
});

describe("an Agent's skills", () => {
  it("carries the shadowed flag", () => {
    expect(AgentSkill.parse({ skill, shadowedByHarness: true }).shadowedByHarness).toBe(true);
    expect(AgentSkill.safeParse({ skill }).success).toBe(false);
  });

  it("takes a list of ids to assign, and an empty list to un-teach everything", () => {
    expect(AssignSkillsInput.parse({ skillIds: ["a", "b"] }).skillIds).toEqual(["a", "b"]);
    expect(AssignSkillsInput.parse({ skillIds: [] }).skillIds).toEqual([]);
    expect(AssignSkillsInput.safeParse({}).success).toBe(false);
  });

  it("registers by path", () => {
    expect(RegisterSkillInput.parse({ path: "skills/handoff" }).path).toBe("skills/handoff");
    expect(RegisterSkillInput.safeParse({}).success).toBe(false);
  });
});

describe("what a run was built from", () => {
  it("knows the three outcomes and labels each", () => {
    for (const outcome of SkillOutcome.options) {
      expect(SKILL_OUTCOME_LABEL[outcome]).toBeTruthy();
    }
    expect(SkillOutcome.safeParse("exploded").success).toBe(false);
  });

  it("a missing skill has no hash", () => {
    expect(RunSkill.parse({ slug: "gone", hash: null, outcome: "missing" }).hash).toBeNull();
  });

  it("parses a run with its instance, its git facts and its skills", () => {
    const parsed = TaskRun.parse(run);
    expect(parsed.instanceHash).toBe("abc123");
    expect(parsed.gitDirty).toBe(false);
    expect(parsed.skills[0].outcome).toBe("loaded");
  });

  it("parses a run from before agent instances: no hash, no git facts, no skills", () => {
    const parsed = TaskRun.parse({ ...run, instanceHash: null, gitSha: null, gitDirty: null, skills: [] });
    expect(parsed.instanceHash).toBeNull();
    expect(parsed.skills).toEqual([]);
  });

  it("refuses a run whose skill has an unknown outcome", () => {
    expect(TaskRun.safeParse({ ...run, skills: [{ slug: "a", hash: null, outcome: "exploded" }] }).success).toBe(false);
  });
});
