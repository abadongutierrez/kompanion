import { useHeartbeatStatus } from "../hooks.js";

export function HeartbeatIndicator() {
  const status = useHeartbeatStatus();

  if (!status.data) return null;

  if (!status.data.enabled) {
    return <span className="text-xs text-neutral-400">Heartbeats: off</span>;
  }

  const lastTick = status.data.lastTickAt
    ? new Date(status.data.lastTickAt).toLocaleTimeString()
    : "never";

  return (
    <span className="text-xs text-neutral-500">
      Heartbeats: on — every {Math.round(status.data.intervalMs / 1000)}s
      <br />
      last tick {lastTick}
      {status.data.lastRunTaskId && ` — ran task ${status.data.lastRunTaskId.slice(0, 8)}`}
    </span>
  );
}
