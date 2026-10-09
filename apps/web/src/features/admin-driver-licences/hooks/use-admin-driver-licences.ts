'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DRIVER_LICENCE_KIND_VALUES, DRIVER_LICENCE_STATUS_VALUES } from '@xeprime/types';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  approveDriverLicence,
  DRIVER_LICENCE_QUEUE_DEFAULT_STATUS,
  fetchDriverLicenceCounts,
  fetchDriverLicenceQueue,
  fetchPlatformDriverLicence,
  fetchPlatformDriverLicenceImage,
  filtersToParams,
  rejectDriverLicence,
} from '../api';
import type {
  ApproveDriverLicenceInput,
  DriverLicenceQueueFilters,
  RejectDriverLicenceInput,
} from '../types';

function oneOf(value: string | null, allowed: readonly string[]): string | undefined {
  return value !== null && allowed.includes(value) ? value : undefined;
}

/**
 * Bộ lọc + lượt nộp đang mở ở URL (ADR 0004) — chia sẻ được, sống qua F5. Giá trị lạ (link cũ,
 * gõ tay) rơi về mặc định thay vì thành một lỗi 400 cho thứ người dùng không hề gõ.
 */
export function useDriverLicenceQueueFilters() {
  return useUrlFilters<DriverLicenceQueueFilters>((sp) => ({
    status:
      oneOf(sp.get('status'), DRIVER_LICENCE_STATUS_VALUES) ?? DRIVER_LICENCE_QUEUE_DEFAULT_STATUS,
    kind: oneOf(sp.get('kind'), DRIVER_LICENCE_KIND_VALUES),
    q: sp.get('q')?.trim() || undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
    open: sp.get('open') ?? undefined,
  }));
}

export function useDriverLicenceQueue(filters: DriverLicenceQueueFilters) {
  return useQuery({
    queryKey: queryKeys.platformDriverLicences.list(filtersToParams(filters)),
    queryFn: () => fetchDriverLicenceQueue(filters),
    placeholderData: keepPreviousData,
  });
}

export function useDriverLicenceCounts() {
  return useQuery({
    queryKey: queryKeys.platformDriverLicences.counts,
    queryFn: fetchDriverLicenceCounts,
  });
}

export function usePlatformDriverLicence(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.platformDriverLicences.detail(id ?? ''),
    queryFn: () => fetchPlatformDriverLicence(id!),
    enabled: Boolean(id),
  });
}

/**
 * Ảnh bằng lái cho người duyệt. URL sống 120 giây ở server; giữ ngắn hơn thế và KHÔNG tự làm mới
 * khi cửa sổ lấy lại focus — mỗi lượt xin URL là một dòng audit, không nên sinh ra vì người duyệt
 * chuyển tab.
 */
export function usePlatformDriverLicenceImage(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.platformDriverLicences.image(id ?? ''),
    queryFn: () => fetchPlatformDriverLicenceImage(id!),
    enabled: Boolean(id),
    staleTime: 90_000,
    gcTime: 100_000,
    refetchOnWindowFocus: false,
  });
}

function useInvalidateQueue() {
  const queryClient = useQueryClient();
  // Làm mới danh sách, bộ đếm, chi tiết — KHÔNG làm mới URL ảnh: mỗi lượt xin URL là một dòng
  // audit "đã mở ảnh", và một quyết định không phải là một lần mở ảnh.
  return () =>
    void queryClient.invalidateQueries({
      queryKey: queryKeys.platformDriverLicences.all,
      predicate: (query) => query.queryKey[1] !== 'image',
    });
}

export function useApproveDriverLicence() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ApproveDriverLicenceInput }) =>
      approveDriverLicence(id, body),
    onSuccess: invalidate,
  });
}

export function useRejectDriverLicence() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RejectDriverLicenceInput }) =>
      rejectDriverLicence(id, body),
    onSuccess: invalidate,
  });
}
