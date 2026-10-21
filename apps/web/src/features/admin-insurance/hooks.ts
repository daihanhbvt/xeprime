'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_PRODUCT_KIND_VALUES,
  INSURANCE_QUEUE_STATUS_ANY,
  type InsurancePolicyStatus,
  type InsuranceProductKind,
  type InsuranceQueueStatusFilter,
} from '@xeprime/types';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  certificateFiltersToParams,
  fetchCertificateDetail,
  fetchCertificates,
  fetchInsuranceProducts,
  retryCertificate,
  updateInsuranceProduct,
  voidCertificate,
} from './api';
import type { CertificateFilters, UpdateInsuranceProductInput } from './types';

// ── Danh mục sản phẩm ───────────────────────────────────────────────────────

export function useInsuranceProducts(enabled = true) {
  return useQuery({
    queryKey: queryKeys.platformInsurance.products,
    queryFn: fetchInsuranceProducts,
    enabled,
  });
}

export function useUpdateInsuranceProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateInsuranceProductInput }) =>
      updateInsuranceProduct(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.platformInsurance.products });
      // Danh mục công khai (quyền lợi cạnh ô chọn) đọc cùng bảng — làm mới luôn bản đã cache.
      void queryClient.invalidateQueries({ queryKey: queryKeys.insurance.all });
    },
  });
}

// ── Hàng đợi giấy chứng nhận ────────────────────────────────────────────────

function isStatusFilter(value: string | null): value is InsuranceQueueStatusFilter {
  return (
    value === INSURANCE_QUEUE_STATUS_ANY ||
    (INSURANCE_POLICY_STATUS_VALUES as readonly string[]).includes(value ?? '')
  );
}

function parseCertificateFilters(params: URLSearchParams): CertificateFilters {
  const status = params.get('status');
  const kind = params.get('productKind');
  return {
    status: isStatusFilter(status) ? status : undefined,
    productKind: (INSURANCE_PRODUCT_KIND_VALUES as readonly string[]).includes(kind ?? '')
      ? (kind as InsuranceProductKind)
      : undefined,
    q: params.get('q')?.trim() || undefined,
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
    open: params.get('open') || undefined,
  };
}

/** Bộ lọc hàng đợi GCN trên URL (ADR 0004) — F5 và gửi link giữ đúng chỗ. */
export function useCertificateFilters() {
  return useUrlFilters(parseCertificateFilters);
}

export function useCertificates(filters: CertificateFilters) {
  const params = certificateFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.platformInsurance.list(params),
    queryFn: () => fetchCertificates(filters),
    placeholderData: keepPreviousData,
  });
}

/** Chi tiết luôn mới (`staleTime: 0`): worker có thể vừa cấp GCN trong lúc người trực đang nhìn. */
export function useCertificateDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.platformInsurance.detail(id ?? ''),
    queryFn: () => fetchCertificateDetail(id as string),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/**
 * Thử lại / thu hồi đổi trạng thái một hợp đồng VÀ con số "phí bảo hiểm đang giữ hộ" của đối soát
 * — làm mới cả nhánh bảo hiểm lẫn nhánh tiền.
 */
function useInvalidateCertificates() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.platformInsurance.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.platformMoney.all });
  };
}

export function useRetryCertificate() {
  const invalidate = useInvalidateCertificates();
  return useMutation({ mutationFn: retryCertificate, onSuccess: invalidate });
}

export function useVoidCertificate() {
  const invalidate = useInvalidateCertificates();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidCertificate(id, reason),
    onSuccess: invalidate,
  });
}

export type { InsurancePolicyStatus };
