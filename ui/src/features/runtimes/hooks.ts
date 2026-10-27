import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateRuntimeInput, UpdateRuntimeInput } from "@kompanion/shared";
import { runtimesApi } from "./api.js";
import { runtimeKeys } from "./keys.js";

export function useRuntimes() {
  return useQuery({ queryKey: runtimeKeys.all, queryFn: runtimesApi.list });
}

export function useCreateRuntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRuntimeInput) => runtimesApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: runtimeKeys.all }),
  });
}

export function useUpdateRuntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runtimeId, input }: { runtimeId: string; input: UpdateRuntimeInput }) =>
      runtimesApi.update(runtimeId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: runtimeKeys.all }),
  });
}

export function useDeleteRuntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runtimesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: runtimeKeys.all }),
  });
}

export function useTestRuntime() {
  return useMutation({ mutationFn: runtimesApi.test });
}
