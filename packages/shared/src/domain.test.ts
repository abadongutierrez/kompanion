import { describe, expect, it } from "vitest";
import {
  AgentSkill,
  AssignSkillsInput,
  monthSpendByRuntime,
  ProjectSpend,
  RegisterSkillInput,
  RunSkill,
  runtimeLabel,
  Skill,
  SKILL_OUTCOME_LABEL,
  SkillDetail,
  SkillOutcome,
  SkillScanResult,
  spendPerConfiguredRuntime,
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

describe("a project's spend by day", () => {
  const spend = {
    projectId: "p1",
    totalSpendUsd: 2,
    totalRunCount: 4,
    monthSpendUsd: 1.5,
    periodStart: "2026-10-01T00:00:00Z",
    byDay: [
      {
        day: "2026-10-02",
        spendUsd: 1.5,
        runCount: 3,
        byRuntime: [
          { runtime: "claude_code", spendUsd: 1.5, runCount: 1 },
          { runtime: "pi", spendUsd: 0, runCount: 1 },
          { runtime: "opencode2", spendUsd: 0, runCount: 1 },
        ],
      },
    ],
  };

  it("parses each day with its runtime split, including a runtime it has never heard of", () => {
    const parsed = ProjectSpend.parse(spend);
    expect(parsed.byDay[0].byRuntime.map((r) => r.runtime)).toEqual(["claude_code", "pi", "opencode2"]);
  });

  it("refuses a day without its split", () => {
    const { byRuntime: _, ...bare } = spend.byDay[0];
    expect(ProjectSpend.safeParse({ ...spend, byDay: [bare] }).success).toBe(false);
  });

  it("totals the month per runtime kind", () => {
    const day2 = { day: "2026-10-03", spendUsd: 0.5, runCount: 1, byRuntime: [{ runtime: "claude_code", spendUsd: 0.5, runCount: 1 }] };
    expect(monthSpendByRuntime([...spend.byDay, day2])).toEqual([
      { runtime: "claude_code", spendUsd: 2, runCount: 2 },
      { runtime: "opencode2", spendUsd: 0, runCount: 1 },
      { runtime: "pi", spendUsd: 0, runCount: 1 },
    ]);
  });

  it("defaults the per-configured-runtime split for payloads without one", () => {
    expect(ProjectSpend.parse(spend).byConfiguredRuntime).toEqual([]);
  });

  it("lists each configured runtime by name, idle ones at $0, plus deleted and unattributed spend", () => {
    const configured = [
      { id: "cc1", name: "Claude Code", kind: "claude_code" as const },
      { id: "cc2", name: "Claude Code Encora", kind: "claude_code" as const },
      { id: "pi1", name: "pi local", kind: "pi" as const },
    ];
    const spent = [
      { runtimeId: "cc2", runtime: "claude_code", runtimeName: "Claude Code Encora", spendUsd: 1.5, runCount: 2 },
      { runtimeId: "cc1", runtime: "claude_code", runtimeName: "Claude Code", spendUsd: 0.25, runCount: 1 },
      { runtimeId: "gone", runtime: "opencode", runtimeName: null, spendUsd: 0.1, runCount: 1 },
      { runtimeId: null, runtime: "claude_code", runtimeName: null, spendUsd: 0.05, runCount: 1 },
      { runtimeId: null, runtime: "some_new_cli", runtimeName: null, spendUsd: 0, runCount: 1 },
    ];
    expect(spendPerConfiguredRuntime(spent, configured).map((r) => [r.key, r.label, r.spendUsd, r.runCount])).toEqual([
      ["cc2", "Claude Code Encora", 1.5, 2],
      ["cc1", "Claude Code", 0.25, 1],
      ["gone", "opencode (deleted)", 0.1, 1],
      ["kind:claude_code", "Claude Code (unattributed)", 0.05, 1],
      ["pi1", "pi local", 0, 0],
      ["kind:some_new_cli", "some_new_cli (unattributed)", 0, 1],
    ]);
  });

  it("labels known runtimes like the Agent form and falls back to the raw value", () => {
    expect(runtimeLabel("claude_code")).toBe("Claude Code");
    expect(runtimeLabel("opencode2")).toBe("opencode v2");
    expect(runtimeLabel("some_future_runtime")).toBe("some_future_runtime");
    for (const k of ["__proto__", "constructor", "toString"]) expect(runtimeLabel(k)).toBe(k);
  });
});
