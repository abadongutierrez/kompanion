import { test, expect, type APIRequestContext } from "@playwright/test";
import { ensureProjectAndTeam, deleteTask } from "./fixtures.js";

// QA verification for "Use markdown to render text from the runs and
// comments": agent text, the run's result summary and comment bodies render
// markdown; raw HTML stays text; tool output stays raw.
test.describe("markdown rendering (QA)", () => {
  let projectId: string;
  let teamId: string;
  let createdTaskId: string | undefined;

  test.beforeAll(async ({ request }) => {
    const seeded = await ensureProjectAndTeam(request);
    projectId = seeded.projectId;
    teamId = seeded.teamId;
  });

  test.afterEach(async ({ request }) => {
    if (createdTaskId) {
      await deleteTask(request, teamId, createdTaskId);
      createdTaskId = undefined;
    }
  });

  async function makeTask(request: APIRequestContext, title: string) {
    const task: { id: string } = await request
      .post(`/api/teams/${teamId}/tasks`, { data: { teamId, title, type: "story" } })
      .then((r) => r.json());
    createdTaskId = task.id;
    return task.id;
  }

  async function addComment(request: APIRequestContext, taskId: string, body: string) {
    const res = await request.post(`/api/teams/${teamId}/tasks/${taskId}/comments`, {
      data: { body },
    });
    expect(res.ok()).toBeTruthy();
  }

  const MD = [
    "## Plan heading",
    "",
    "Some **bold** and `inline code` and a [link](https://example.com).",
    "",
    "- first item",
    "- second item",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
    "| col A | col B |",
    "| ----- | ----- |",
    "| a1    | b1    |",
    "",
    "<b>raw html</b>",
  ].join("\n");

  test("run transcript renders text and result summary as markdown", async ({ page, request }) => {
    const taskId = await makeTask(request, `QA md run ${Date.now()}`);
    const runId = "22222222-2222-2222-2222-222222222222";

    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({
        json: [
          {
            id: runId, taskId, agentId: null, agentTitle: "Engineer", runtime: "claude_code",
            model: null, status: "succeeded", summary: null, rawOutput: null, costUsd: 0.01,
            durationMs: 1000, inputTokens: null, outputTokens: null, cacheReadTokens: null,
            cacheWriteTokens: null, createdAt: "2026-10-26T12:00:00.000Z",
          },
        ],
      }),
    );
    const events = [
      {
        type: "stream_event",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: MD } },
      },
      { type: "stream_event", event: { type: "content_block_stop", index: 0 } },
      { type: "result", subtype: "success", result: "**Summary** done\n\n- s1", total_cost_usd: 0.01 },
    ];
    const body =
      events.map((payload, seq) => `data: ${JSON.stringify({ seq, payload })}\n\n`).join("") +
      "event: done\ndata: {}\n\n";
    await page.route(`**/runs/${runId}/events`, (route) =>
      route.fulfill({ contentType: "text/event-stream", body }),
    );

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);

    await expect(page.getByRole("heading", { name: "Plan heading", level: 2 })).toBeVisible();
    await expect(page.locator("strong", { hasText: "bold" }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: "inline code" })).toBeVisible();
    const link = page.getByRole("link", { name: "link", exact: true });
    await expect(link).toHaveAttribute("href", "https://example.com");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("listitem").filter({ hasText: "first item" })).toBeVisible();
    await expect(page.locator("pre code", { hasText: "const x = 1;" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "b1" })).toBeVisible();
    // Raw HTML must not be parsed.
    await expect(page.locator("b", { hasText: "raw html" })).toHaveCount(0);
    await expect(page.getByText("<b>raw html</b>")).toBeVisible();
    // No literal markdown markers left over.
    await expect(page.getByText("## Plan heading")).toHaveCount(0);

    // Result summary.
    await expect(page.getByText("✅ Done")).toBeVisible();
    await expect(page.locator("strong", { hasText: "Summary" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "s1" })).toBeVisible();
  });

  // While a text block streams (no content_block_stop yet), the cursor is the
  // ::after of the last block, i.e. inline after the last word, not a line below.
  test("streaming cursor follows the last word of the text", async ({ page, request }) => {
    const taskId = await makeTask(request, `QA md stream ${Date.now()}`);
    const runId = "33333333-3333-3333-3333-333333333333";
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({
        json: [
          {
            id: runId, taskId, agentId: null, agentTitle: "Engineer", runtime: "claude_code",
            model: null, status: "running", summary: null, rawOutput: null, costUsd: null,
            durationMs: null, inputTokens: null, outputTokens: null, cacheReadTokens: null,
            cacheWriteTokens: null, createdAt: "2026-10-26T12:00:00.000Z",
          },
        ],
      }),
    );
    const payload = {
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "Working on **it** now" } },
    };
    await page.route(`**/runs/${runId}/events`, (route) =>
      route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ seq: 0, payload })}\n\n` }),
    );

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const p = page.locator("p", { hasText: "Working on" });
    await expect(p).toBeVisible();
    const after = await p.evaluate((el) => {
      const s = getComputedStyle(el, "::after");
      return { content: s.content, display: s.display };
    });
    expect(after.content).toBe('"▍"');
    expect(after.display).toBe("inline");
    // No leftover standalone cursor element on its own line.
    await expect(page.locator("span", { hasText: /^▍$/ })).toHaveCount(0);
  });

  test("comment bodies render markdown and keep HTML/script as text", async ({ page, request }) => {
    const taskId = await makeTask(request, `QA md comment ${Date.now()}`);
    await addComment(request, taskId, "### Comment title\n\n1. one\n2. two\n\n`code here`");
    await addComment(request, taskId, "<script>window.__pwned = true</script> <img src=x onerror=\"window.__pwned=true\">");
    await addComment(request, taskId, "[bad](javascript:window.__pwned=true)");

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await page.getByRole("tab", { name: /^Comments/ }).click();

    await expect(page.getByRole("heading", { name: "Comment title", level: 3 })).toBeVisible();
    await expect(page.locator("ol > li", { hasText: "two" })).toBeVisible();
    await expect(page.locator("code", { hasText: "code here" })).toBeVisible();

    await expect(page.getByText("<script>window.__pwned = true</script>", { exact: false })).toBeVisible();
    await expect(page.locator("main img, [role=tabpanel] img")).toHaveCount(0);
    const bad = page.getByRole("link", { name: "bad" });
    expect(await bad.getAttribute("href")).not.toMatch(/^javascript:/i);
    await bad.click({ modifiers: [] }).catch(() => {});
    expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeFalsy();
  });

  // A human types a comment in a textarea; single line breaks used to be
  // preserved (whitespace-pre-wrap). Plain markdown folds them into spaces.
  test("single line breaks in a comment are preserved", async ({ page, request }) => {
    const taskId = await makeTask(request, `QA md breaks ${Date.now()}`);
    await addComment(request, taskId, "line one\nline two");

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await page.getByRole("tab", { name: /^Comments/ }).click();

    const p = page.locator("p", { hasText: "line one" });
    await expect(p).toBeVisible();
    const lines = await p.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return new Set(Array.from(r.getClientRects()).map((c) => Math.round(c.top))).size;
    });
    expect(lines).toBeGreaterThan(1);
  });

  // remark-breaks must not touch code fences: newlines there stay literal, no <br>.
  test("code fences keep their newlines without <br>", async ({ page, request }) => {
    const taskId = await makeTask(request, `QA md fence ${Date.now()}`);
    await addComment(request, taskId, "```\nalpha\nbeta\n```");

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await page.getByRole("tab", { name: /^Comments/ }).click();

    const code = page.locator("pre code", { hasText: "alpha" });
    await expect(code).toBeVisible();
    await expect(code.locator("br")).toHaveCount(0);
    expect(await code.textContent()).toContain("alpha\nbeta");
  });

  // PR review fixes: renderer classes merge with GFM's own, footnote links
  // stay in the tab, and footnote ids don't collide between comments.
  test("task lists, language fences and footnotes", async ({ page, request }) => {
    const taskId = await makeTask(request, `QA md footnotes ${Date.now()}`);
    await addComment(request, taskId, "- [ ] todo\n- [x] done\n\n```ts\nconst y = 2;\n```");
    await addComment(request, taskId, "First note[^1]\n\n[^1]: note one");
    await addComment(request, taskId, "Second note[^1]\n\n[^1]: note two");

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await page.getByRole("tab", { name: /^Comments/ }).click();

    const taskList = page.locator("ul.contains-task-list");
    await expect(taskList).toBeVisible();
    await expect(taskList).toHaveClass(/pl-5/);
    const fence = page.locator("pre code.language-ts");
    await expect(fence).toBeVisible();
    await expect(fence).toHaveClass(/font-mono/);

    const refs = page.locator("a[data-footnote-ref]");
    await expect(refs).toHaveCount(2);
    const hrefs = await refs.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(2);
    for (const ref of await refs.all()) {
      expect(await ref.getAttribute("target")).toBeNull();
    }
    // Every footnote href points at an element that exists on the page.
    for (const href of hrefs) {
      await expect(page.locator(`[id="${href!.slice(1)}"]`)).toHaveCount(1);
    }
  });
});
