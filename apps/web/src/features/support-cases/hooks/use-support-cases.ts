'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchSupportCase,
  fetchSupportCases,
  filtersToParams,
  openSupportCase,
  postSupportMessage,
  resolveSupportCase,
  transitionSupportCase,
} from '../api';
import type {
  OpenSupportCaseInput,
  PostSupportEventInput,
  ResolveSupportCaseInput,
  SupportCaseFilters,
  SupportSurface,
  TransitionSupportCaseInput,
} from '../types';

export function useSupportCases(surface: SupportSurface, filters: SupportCaseFilters) {
  return useQuery({
    queryKey: queryKeys.supportCases.list(filtersToParams(surface, filters)),
    queryFn: () => fetchSupportCases(surface, filters),
    placeholderData: keepPreviousData,
  });
}

export function useSupportCase(surface: SupportSurface, id: string | null) {
  return useQuery({
    queryKey: queryKeys.supportCases.detail(`${surface}:${id ?? ''}`),
    queryFn: () => fetchSupportCase(surface, id!),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

function useInvalidateSupport() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.supportCases.all });
}

export function useOpenSupportCase(surface: SupportSurface) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (body: OpenSupportCaseInput) => openSupportCase(surface, body),
    onSuccess: invalidate,
  });
}

export function usePostSupportMessage(surface: SupportSurface) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & PostSupportEventInput) =>
      postSupportMessage(surface, id, body),
    onSuccess: invalidate,
  });
}

export function useTransitionSupportCase(surface: SupportSurface) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & TransitionSupportCaseInput) =>
      transitionSupportCase(surface, id, body),
    onSuccess: invalidate,
  });
}

/**
 * Kết luận một case — CHỈ nền tảng. Đây là bước phán xét, và với tranh chấp nó là điều kiện mở
 * khoá việc chốt kết cục khoản giữ chỗ ở màn money operations (hai bước tách rời có chủ đích).
 */
export function useResolveSupportCase() {
  const invalidate = useInvalidateSupport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ResolveSupportCaseInput) =>
      resolveSupportCase(id, body),
    onSuccess: () => {
      invalidate();
      // Kết luận tranh chấp mở khoá hàng đợi chốt tiền — làm mới cả nhánh money.
      void queryClient.invalidateQueries({ queryKey: queryKeys.platformMoney.all });
    },
  });
}
