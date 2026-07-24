// In-process fan-out from a run's streaming Claude invocation to any open
// SSE connections watching it. A single Map is sufficient because this
// server runs as one Node process — no external pub/sub needed.
//
// Events carry their `seq` so a client that queried persisted history and
// then subscribed can dedupe anything published in the (tiny, single
// await's worth of) gap between those two steps, rather than double-apply
// a delta.
type Listener = (seq: number, payload: unknown) => void;
type EndListener = () => void;

const listenersByRun = new Map<string, Set<Listener>>();
const endListenersByRun = new Map<string, Set<EndListener>>();

export function publishRunEvent(runId: string, seq: number, payload: unknown): void {
  for (const listener of listenersByRun.get(runId) ?? []) {
    listener(seq, payload);
  }
}

// Callers must only publish this once the run's task_runs row is already in
// its terminal state (status != "running") — a subscriber that checks
// status and then subscribes must never observe "running" followed by
// silence forever because the end signal already fired before the DB
// write landed.
export function publishRunEnd(runId: string): void {
  for (const listener of endListenersByRun.get(runId) ?? []) {
    listener();
  }
  listenersByRun.delete(runId);
  endListenersByRun.delete(runId);
}

export function subscribeToRun(
  runId: string,
  onEvent: Listener,
  onEnd: EndListener,
): () => void {
  let listeners = listenersByRun.get(runId);
  if (!listeners) {
    listeners = new Set();
    listenersByRun.set(runId, listeners);
  }
  listeners.add(onEvent);

  let endListeners = endListenersByRun.get(runId);
  if (!endListeners) {
    endListeners = new Set();
    endListenersByRun.set(runId, endListeners);
  }
  endListeners.add(onEnd);

  return () => {
    listenersByRun.get(runId)?.delete(onEvent);
    endListenersByRun.get(runId)?.delete(onEnd);
  };
}
