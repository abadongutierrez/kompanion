// The one place that knows how we talk to the server: the /api prefix, the
// JSON headers, and the error shape the Kotlin controllers return.
//
// Feature api modules import `request` and `apiBase` from here and own their
// own endpoints. Nothing else should call fetch directly, with one standing
// exception: SSE, which opens an EventSource against a URL rather than
// fetching JSON (see features/runs).

export const apiBase = "/api";

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      typeof body.error === "string" ? body.error : JSON.stringify(body.error);
    throw new Error(body.error ? message : res.statusText);
  }
  return res.json();
}
