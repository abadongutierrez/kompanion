import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTaskCommentInput,
  CreateTaskDependencyInput,
  CreateTaskInput,
  TaskStatus,
  UpdateTaskCommentInput,
  UpdateTaskInput,
} from "@kompanion/shared";
import { tasksApi } from "./api.js";
import { taskKeys } from "./keys.js";

// Polled on a 4s interval: status and runningSince change server-side while
// an agent works, and both the board and the task page have to see it.
export function useTasks(teamId: string | null) {
  return useQuery({
    queryKey: taskKeys.byTeam(teamId!),
    queryFn: () => tasksApi.listTasks(teamId!),
    enabled: !!teamId,
    refetchInterval: 4000,
  });
}

// There is no single-task endpoint; the list is already the app's source of
// truth for a task, and polling it keeps this live too.
export function useTask(teamId: string | null, taskId: string | undefined) {
  const tasks = useTasks(teamId);
  return {
    ...tasks,
    data: taskId ? tasks.data?.find((t) => t.id === taskId) : undefined,
  };
}

// Every task mutation invalidates the same team list, so they share one
// factory rather than repeating the wiring nine times.
function useTaskMutation<TArgs>(
  teamId: string,
  mutationFn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: taskKeys.byTeam(teamId) }),
  });
}

export function useCreateTask(teamId: string) {
  return useTaskMutation(teamId, (input: Omit<CreateTaskInput, "teamId">) =>
    tasksApi.createTask({ ...input, teamId }),
  );
}

export function useUpdateTaskStatus(teamId: string) {
  return useTaskMutation(
    teamId,
    ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      tasksApi.updateTaskStatus(teamId, taskId, status),
  );
}

export function useAssignTaskAgent(teamId: string) {
  return useTaskMutation(
    teamId,
    ({ taskId, agentId }: { taskId: string; agentId: string | null }) =>
      tasksApi.assignTaskAgent(teamId, taskId, agentId),
  );
}

export function useUpdateTask(teamId: string) {
  return useTaskMutation(
    teamId,
    ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) =>
      tasksApi.updateTask(teamId, taskId, input),
  );
}

export function useDeleteTask(teamId: string) {
  return useTaskMutation(teamId, (taskId: string) =>
    tasksApi.deleteTask(teamId, taskId),
  );
}

// The edit form saves the task and reconciles its repository links in one
// action, so this is one mutation rather than the caller orchestrating three.
export function useSaveTask(teamId: string) {
  return useTaskMutation(
    teamId,
    async ({
      taskId,
      input,
      repositoryIds,
      originalRepositoryIds,
    }: {
      taskId: string;
      input: UpdateTaskInput;
      repositoryIds: string[];
      originalRepositoryIds: string[];
    }) => {
      await tasksApi.updateTask(teamId, taskId, input);

      const original = new Set(originalRepositoryIds);
      const next = new Set(repositoryIds);
      for (const id of next) {
        if (!original.has(id)) await tasksApi.addTaskRepository(teamId, taskId, id);
      }
      for (const id of original) {
        if (!next.has(id)) await tasksApi.removeTaskRepository(teamId, taskId, id);
      }
    },
  );
}

export function useTaskDependencies(teamId: string, taskId: string) {
  return useQuery({
    queryKey: taskKeys.dependencies(taskId),
    queryFn: () => tasksApi.listTaskDependencies(teamId, taskId),
  });
}

function useDependencyMutation<TArgs>(
  taskId: string,
  mutationFn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: taskKeys.dependencies(taskId) }),
  });
}

export function useAddTaskDependency(teamId: string, taskId: string) {
  return useDependencyMutation(taskId, (input: CreateTaskDependencyInput) =>
    tasksApi.addTaskDependency(teamId, taskId, input),
  );
}

export function useRemoveTaskDependency(teamId: string, taskId: string) {
  return useDependencyMutation(taskId, (dependencyId: string) =>
    tasksApi.removeTaskDependency(teamId, taskId, dependencyId),
  );
}

export function useTaskComments(teamId: string, taskId: string) {
  return useQuery({
    queryKey: taskKeys.comments(taskId),
    queryFn: () => tasksApi.listTaskComments(teamId, taskId),
  });
}

function useCommentMutation<TArgs>(
  taskId: string,
  mutationFn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) }),
  });
}

export function useAddTaskComment(teamId: string, taskId: string) {
  return useCommentMutation(taskId, (input: CreateTaskCommentInput) =>
    tasksApi.addTaskComment(teamId, taskId, input),
  );
}

export function useUpdateTaskComment(teamId: string, taskId: string) {
  return useCommentMutation(
    taskId,
    ({ commentId, input }: { commentId: string; input: UpdateTaskCommentInput }) =>
      tasksApi.updateTaskComment(teamId, taskId, commentId, input),
  );
}

export function useReplyAsAgent(teamId: string, taskId: string) {
  return useCommentMutation(
    taskId,
    ({ commentId, agentId }: { commentId: string; agentId: string }) =>
      tasksApi.replyAsAgent(teamId, taskId, commentId, agentId),
  );
}
