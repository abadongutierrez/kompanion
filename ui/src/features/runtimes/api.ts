import type {
  CreateRuntimeInput,
  Runtime,
  RuntimeTestResult,
  UpdateRuntimeInput,
} from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

export const runtimesApi = {
  list: () => request<Runtime[]>(`${apiBase}/runtimes`),
  create: (input: CreateRuntimeInput) =>
    request<Runtime>(`${apiBase}/runtimes`, { method: "POST", body: JSON.stringify(input) }),
  update: (runtimeId: string, input: UpdateRuntimeInput) =>
    request<Runtime>(`${apiBase}/runtimes/${runtimeId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  // 204 with no body, so not `request` — but the 409 for a runtime that an
  // Agent still uses carries the reason, which is what the caller shows.
  remove: async (runtimeId: string): Promise<void> => {
    const res = await fetch(`${apiBase}/runtimes/${runtimeId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : res.statusText);
    }
  },
  test: (runtimeId: string) =>
    request<RuntimeTestResult>(`${apiBase}/runtimes/${runtimeId}/test`, { method: "POST" }),
};
