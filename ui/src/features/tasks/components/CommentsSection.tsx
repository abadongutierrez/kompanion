import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Agent, TaskWithRepositories } from "@kompanion/shared";
import {
  useAddTaskComment,
  useReplyAsAgent,
  useTaskComments,
  useUpdateTaskComment,
} from "../hooks.js";
import { Markdown } from "@/shared/ui/index.js";

// The board card's collapsible take on a task's comments. The task page shows
// the same thread, uncollapsed, in its Comments tab.
export function CommentsSection({
  teamId,
  task,
  agents,
}: {
  teamId: string;
  task: TaskWithRepositories;
  agents: Agent[];
}) {
  const comments = useTaskComments(teamId, task.id, { isRunning: !!task.runningSince });
  const count = comments.data?.length ?? 0;

  return (
    <details className="space-y-2 border-t border-neutral-100 pt-2 text-xs">
      <summary className="cursor-pointer font-medium text-neutral-500">
        Comments {count > 0 && `(${count})`}
      </summary>
      <CommentsThread
        teamId={teamId}
        taskId={task.id}
        agents={agents}
        isRunning={!!task.runningSince}
      />
    </details>
  );
}

export function CommentsThread({
  teamId,
  taskId,
  agents,
  isRunning,
}: {
  teamId: string;
  taskId: string;
  agents: Agent[];
  // Whether the task has a run going; the thread polls while it does.
  isRunning: boolean;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const [body, setBody] = useState("");
  const [asAgentId, setAsAgentId] = useState("");
  // Which Operator comment is open for editing, and its draft body.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const comments = useTaskComments(teamId, taskId, { isRunning });
  const addComment = useAddTaskComment(teamId, taskId);
  const replyAsAgent = useReplyAsAgent(teamId, taskId);
  const editComment = useUpdateTaskComment(teamId, taskId);

  const isReplying = (commentId: string, agentId: string) =>
    replyAsAgent.isPending &&
    replyAsAgent.variables?.commentId === commentId &&
    replyAsAgent.variables?.agentId === agentId;

  return (
    <div className="space-y-2 text-xs">

      {(comments.data ?? []).map((comment) => (
        <div
          key={comment.id}
          className={`space-y-1 rounded-md border border-l-4 border-neutral-200 bg-white p-2 shadow-sm ${
            comment.agentId === null ? "border-l-neutral-400" : "border-l-indigo-400"
          }`}
        >
          <div className="flex items-center justify-between text-neutral-400">
            <span className="font-semibold text-neutral-700">
              {comment.authorTitle ?? "Operator"}
              {comment.agentId !== null && (
                <span className="ml-1 rounded bg-indigo-50 px-1 font-normal text-indigo-600">
                  agent
                </span>
              )}
            </span>
            <span>
              {new Date(comment.createdAt).toLocaleTimeString()}
              {comment.updatedAt && " (edited)"}
            </span>
          </div>
          {editingId === comment.id ? (
            <form
              className="flex flex-col gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!editBody.trim()) return;
                editComment.mutate(
                  { commentId: comment.id, input: { body: editBody } },
                  { onSuccess: () => setEditingId(null) },
                );
              }}
            >
              <textarea
                className="w-full rounded border border-neutral-200 px-2 py-1"
                rows={2}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              <div className="flex items-center gap-1">
                <button
                  type="submit"
                  className="rounded border border-neutral-300 bg-white px-2 py-0.5 hover:bg-neutral-100 disabled:opacity-50"
                  disabled={editComment.isPending || !editBody.trim()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="rounded border border-neutral-300 bg-white px-2 py-0.5 hover:bg-neutral-100"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <Markdown className="text-neutral-700">{comment.body}</Markdown>
              {/* Only Operator comments are editable — an agent's comment is
                  the record of what its run reported. */}
              {comment.agentId === null && (
                <button
                  className="text-neutral-400 underline hover:text-neutral-600"
                  onClick={() => {
                    setEditingId(comment.id);
                    setEditBody(comment.body);
                  }}
                >
                  Edit
                </button>
              )}
            </>
          )}
          {comment.mentionedAgents.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {comment.mentionedAgents.map((agent) => {
                // A comment gets one successful run per agent: while one is
                // running or once one succeeded, the button goes inert and a
                // link to that run takes its place. Failed or refused tries
                // don't count, so those can be retried.
                const run = comment.runs.find(
                  (r) => r.agentId === agent.id && (r.status === "running" || r.status === "succeeded"),
                );
                const replying = isReplying(comment.id, agent.id);
                return (
                  <span key={agent.id} className="inline-flex items-center gap-1">
                    <button
                      className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                      disabled={replying || !!run}
                      onClick={() =>
                        replyAsAgent.mutate({ commentId: comment.id, agentId: agent.id })
                      }
                    >
                      {replying ? `Running ${agent.title}…` : `Run as ${agent.title}`}
                    </button>
                    {run && projectId && (
                      <Link
                        className="text-indigo-600 underline hover:text-indigo-800"
                        to={`/projects/${projectId}/tasks/${taskId}?team=${teamId}&run=${run.runId}`}
                      >
                        {run.status === "running" ? "View run (running)" : "View run"}
                      </Link>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <form
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          addComment.mutate(
            { agentId: asAgentId || null, body },
            { onSuccess: () => setBody("") },
          );
        }}
      >
        <textarea
          className="w-full rounded border border-neutral-200 px-2 py-1"
          placeholder="Add a comment… mention an agent with @slug"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex items-center gap-1">
          <select
            className="rounded border border-neutral-200 px-1 py-0.5"
            value={asAgentId}
            onChange={(e) => setAsAgentId(e.target.value)}
          >
            <option value="">as Operator</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                as {agent.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100 disabled:opacity-50"
            disabled={addComment.isPending}
          >
            Comment
          </button>
        </div>
      </form>
    </div>
  );
}
