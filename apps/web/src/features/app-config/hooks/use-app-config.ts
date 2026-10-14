'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  activatePlanGuideTemplate,
  createPlanGuideTemplate,
  deletePlanGuideTemplate,
  duplicatePlanGuideTemplate,
  fetchPlanGuideTemplate,
  fetchPlanGuideTemplates,
  fetchPlatformPartnerAppConfig,
  previewPlanGuideTemplate,
  sendTestPlanGuideTemplate,
  updatePlanGuideTemplate,
  updatePlatformPartnerAppConfig,
} from '../api';
import type {
  CreatePlanGuideTemplateInput,
  DuplicatePlanGuideTemplateInput,
  PlanGuideTemplate,
  PlanGuideTemplateFilters,
  PreviewPlanGuideTemplateInput,
  SendTestPlanGuideTemplateInput,
  UpdatePartnerAppConfigInput,
  UpdatePlanGuideTemplateInput,
} from '../types';

// ── Cấu hình app Partner ───────────────────────────────────────────────────

/**
 * Cấu hình hiện hành — KHÔNG cache (`staleTime: 0`): một công tắc tác động ngay tới người dùng
 * đang mở app, nên admin phải luôn thấy trạng thái thật, không phải bản của lần mở trước.
 */
export function usePlatformPartnerAppConfig() {
  return useQuery({
    queryKey: queryKeys.appConfig.platformPartner,
    queryFn: fetchPlatformPartnerAppConfig,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useUpdatePlatformPartnerAppConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePartnerAppConfigInput) => updatePlatformPartnerAppConfig(body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.appConfig.platformPartner, data);
      void qc.invalidateQueries({ queryKey: queryKeys.appConfig.partner });
    },
  });
}

// ── Mẫu email hướng dẫn gói ─────────────────────────────────────────────────

/** Bộ lọc danh sách mẫu — ở URL (ADR 0004). */
export function usePlanGuideTemplateFilters() {
  return useUrlFilters<PlanGuideTemplateFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    page: positiveIntParam(sp, 'page') ?? 1,
  }));
}

export function usePlanGuideTemplates(filters: PlanGuideTemplateFilters) {
  return useQuery({
    queryKey: queryKeys.appConfig.planGuideTemplates({ q: filters.q ?? null, page: filters.page }),
    queryFn: () => fetchPlanGuideTemplates(filters),
    placeholderData: keepPreviousData,
  });
}

export function usePlanGuideTemplate(id: string | null) {
  return useQuery({
    queryKey: queryKeys.appConfig.planGuideTemplate(id ?? ''),
    queryFn: () => fetchPlanGuideTemplate(id!),
    enabled: Boolean(id),
    // Trang soạn: luôn đọc bản mới nhất để `expectedVersion` không cũ ngay từ lúc mở.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Một lượt ghi đổi cả danh sách (mẫu đang bật là DUY NHẤT — bật mẫu này tắt mẫu kia), nên làm
 * mới cả nhánh mẫu chứ không chỉ một dòng.
 */
function useTemplateWrite<TVars>(fn: (vars: TVars) => Promise<PlanGuideTemplate>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.appConfig.planGuideTemplate(data.id), data);
      void qc.invalidateQueries({ queryKey: queryKeys.appConfig.planGuideTemplateLists });
    },
  });
}

export function useCreatePlanGuideTemplate() {
  return useTemplateWrite((body: CreatePlanGuideTemplateInput) => createPlanGuideTemplate(body));
}

export function useUpdatePlanGuideTemplate() {
  return useTemplateWrite(({ id, ...body }: { id: string } & UpdatePlanGuideTemplateInput) =>
    updatePlanGuideTemplate(id, body),
  );
}

export function useDuplicatePlanGuideTemplate() {
  return useTemplateWrite(({ id, ...body }: { id: string } & DuplicatePlanGuideTemplateInput) =>
    duplicatePlanGuideTemplate(id, body),
  );
}

export function useActivatePlanGuideTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activatePlanGuideTemplate(id),
    // Bật một mẫu TẮT mẫu khác — mọi bản chi tiết đang cache có thể đã đổi `isActive`.
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.appConfig.planGuideTemplatesAll }),
  });
}

export function useDeletePlanGuideTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePlanGuideTemplate(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.appConfig.planGuideTemplate(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.appConfig.planGuideTemplateLists });
    },
  });
}

/**
 * Xem trước bản nháp — query chứ không mutation: cùng đầu vào thì cùng kết quả, và TanStack tự
 * huỷ kết quả của đầu vào cũ khi người soạn gõ tiếp (đầu vào đã được debounce ở component).
 */
export function usePlanGuideTemplatePreview(
  id: string | null,
  input: PreviewPlanGuideTemplateInput,
) {
  return useQuery({
    queryKey: [...queryKeys.appConfig.planGuideTemplate(id ?? ''), 'preview', input] as const,
    queryFn: () => previewPlanGuideTemplate(id!, input),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
    staleTime: 0,
    retry: false,
  });
}

export function useSendTestPlanGuideTemplate() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & SendTestPlanGuideTemplateInput) =>
      sendTestPlanGuideTemplate(id, body),
  });
}
