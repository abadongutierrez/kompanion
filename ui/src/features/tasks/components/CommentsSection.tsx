import { useState } from "react";
import type { Agent, TaskWithRepositories } from "@kompanion/shared";
import {
  useAddTaskComment,
  useReplyAsAgent,
  useTaskComments,
  useUpdateTaskComment,
} from "../hooks.js";

export function CommentsSection({
  teamId,
  task,
  agents,
}: {
  teamId: string;
  task: TaskWithRepositories;
  agents: Agent[];
}) {
  const [body, setBody] = useState("");
  const [asAgentId, setAsAgentId] = useState("");
  // Which Operator comment is open for editing, and its draft body.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const comments = useTaskComments(teamId, task.id);
  const addComment = useAddTaskComment(teamId, task.id);
  const replyAsAgent = useReplyAsAgent(teamId, task.id);
  const editComment = useUpdateTaskComment(teamId, task.id);

  const count = comments.data?.length ?? 0;

  const isReplying = (commentId: string, agentId: string) =>
    replyAsAgent.isPending &&
    replyAsAgent.variables?.commentId === commentId &&
    replyAsAgent.variables?.agentId === agentId;

  return (
    <details className="space-y-2 border-t border-neutral-100 pt-2 text-xs">
      <summary className="cursor-pointer font-medium text-neutral-500">
        Comments {count > 0 && `(${count})`}
      </summary>

      {(comments.data ?? []).map((comment) => (
        <div key={comment.id} className="space-y-1 rounded bg-neutral-50 p-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="font-medium text-neutral-600">
              {comment.authorTitle ?? "Operator"}
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
              <p className="whitespace-pre-wrap text-neutral-700">{comment.body}</p>
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
              {comment.mentionedAgents.map((agent) => (
                <button
                  key={agent.id}
                  className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                  disabled={isReplying(comment.id, agent.id)}
                  onClick={() =>
                    replyAsAgent.mutate({ commentId: comment.id, agentId: agent.id })
                  }
                >
                  {isReplying(comment.id, agent.id)
                    ? `Running ${agent.title}…`
                    : `Run as ${agent.title}`}
                </button>
              ))}
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
    </details>
  );
}
