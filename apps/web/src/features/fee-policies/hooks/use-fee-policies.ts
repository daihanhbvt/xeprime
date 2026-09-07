'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  activateFeePolicy,
  createFeePolicyDraft,
  discardFeePolicyDraft,
  fetchFeePolicies,
  updateFeePolicyDraft,
} from '../api';
import type { UpsertFeePolicyInput } from '../types';

export function useFeePolicies() {
  return useQuery({
    queryKey: queryKeys.feePolicies.list(),
    queryFn: fetchFeePolicies,
  });
}

function useInvalidateFeePolicies() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.feePolicies.all });
}

export function useCreateFeePolicyDraft() {
  const invalidate = useInvalidateFeePolicies();
  return useMutation({
    mutationFn: (body: UpsertFeePolicyInput) => createFeePolicyDraft(body),
    onSuccess: invalidate,
  });
}

export function useUpdateFeePolicyDraft() {
  const invalidate = useInvalidateFeePolicies();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpsertFeePolicyInput) => updateFeePolicyDraft(id, body),
    onSuccess: invalidate,
  });
}

export function useActivateFeePolicy() {
  const invalidate = useInvalidateFeePolicies();
  return useMutation({
    mutationFn: (id: string) => activateFeePolicy(id),
    onSuccess: invalidate,
  });
}

export function useDiscardFeePolicyDraft() {
  const invalidate = useInvalidateFeePolicies();
  return useMutation({
    mutationFn: (id: string) => discardFeePolicyDraft(id),
    onSuccess: invalidate,
  });
}
