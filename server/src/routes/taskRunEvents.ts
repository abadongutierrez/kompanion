import { Router } from "express";
import { sql } from "../db/client.js";
import { subscribeToRun } from "../runner/runEvents.js";

export const taskRunEventsRouter = Router({ mergeParams: true });

type Params = { taskId: string; runId: string };

// SSE: replays persisted history for this run (task_run_events, in seq
// order), then — if the run isn't finished yet — stays open and streams new
// events live as runTask.ts publishes them, closing once the run reaches a
// terminal status. Frames carry `seq` so a client can dedupe anything
// published in the brief gap between the catch-up query and subscribing.
taskRunEventsRouter.get("/", async (req, res) => {
  const { taskId, runId } = req.params as Params;

  const [run] = await sql`
    select * from task_runs where id = ${runId} and task_id = ${taskId}
  `;
  if (!run) {
    return res.status(404).json({ error: "run not found" });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  function writeEvent(seq: number, payload: unknown): void {
    res.write(`data: ${JSON.stringify({ seq, payload })}\n\n`);
  }

  // payload is stored as raw JSON text (see migration comment) precisely so
  // it comes back untouched by the client's camelCase-transforming JSONB
  // path — parse it back into an object here before re-wrapping for the
  // client, same shape as a live (never-persisted) event.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function writeStoredEvent(row: any): void {
    writeEvent(row.seq as number, JSON.parse(row.payload as string));
  }

  const history = await sql`
    select seq, payload from task_run_events where run_id = ${runId} order by seq
  `;
  let lastSeq = -1;
  for (const row of history) {
    lastSeq = row.seq as number;
    writeStoredEvent(row);
  }

  if (run.status !== "running") {
    res.write("event: done\ndata: {}\n\n");
    return res.end();
  }

  let finalized = false;
  function finalize(): void {
    if (finalized) return;
    finalized = true;
    unsubscribe();
    res.write("event: done\ndata: {}\n\n");
    res.end();
  }

  const unsubscribe = subscribeToRun(
    runId,
    (seq, payload) => writeEvent(seq, payload),
    finalize,
  );
  req.on("close", unsubscribe);

  // Closes the remaining race: the run could have finished (and already
  // published its end signal) in the gap between the catch-up query above
  // and subscribeToRun just now, which would otherwise leave this
  // connection subscribed to listener sets that already got cleared and
  // will never fire again. Any events this reconciliation re-sends that
  // were also already delivered live are harmless — the client dedupes by
  // seq. New events created by another run reaching the timeout/error path
  // right as the query below executes are naturally also above `lastSeq`.
  const [latest] = await sql`select status from task_runs where id = ${runId}`;
  if (latest && latest.status !== "running") {
    const missed = await sql`
      select seq, payload from task_run_events
      where run_id = ${runId} and seq > ${lastSeq}
      order by seq
    `;
    for (const row of missed) {
      writeStoredEvent(row);
    }
    finalize();
  }
});
