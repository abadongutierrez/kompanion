import type {
  AgentSkill,
  AssignSkillsInput,
  RegisterSkillInput,
  Skill,
  SkillDetail,
  SkillScanResult,
} from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

export const skillsApi = {
  // The app-wide skills library: folders on disk, one row each.
  list: () => request<Skill[]>(`${apiBase}/skills`),
  get: (skillId: string) => request<SkillDetail>(`${apiBase}/skills/${skillId}`),
  register: (input: RegisterSkillInput) =>
    request<Skill>(`${apiBase}/skills`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  scan: () => request<SkillScanResult>(`${apiBase}/skills/scan`, { method: "POST" }),
  // 204 with no body, so not `request` (which parses JSON) — but the 409 for
  // a skill that is still assigned carries the reason, and that is the one
  // thing the caller has to show.
  unregister: async (skillId: string): Promise<void> => {
    const res = await fetch(`${apiBase}/skills/${skillId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : res.statusText);
    }
  },

  // What an Agent has been taught. Assigning replaces the whole set.
  listForAgent: (agentId: string) =>
    request<AgentSkill[]>(`${apiBase}/agents/${agentId}/skills`),
  assign: (agentId: string, input: AssignSkillsInput) =>
    request<AgentSkill[]>(`${apiBase}/agents/${agentId}/skills`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
};
