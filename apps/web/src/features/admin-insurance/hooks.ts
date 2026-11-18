'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_PRODUCT_KIND_VALUES,
  INSURANCE_QUEUE_STATUS_ANY,
  INSURANCE_VEHICLE_ELIGIBILITY_FILTER_VALUES,
  type InsurancePolicyStatus,
  type InsuranceVehicleEligibilityFilter,
  type InsuranceProductKind,
  type InsuranceQueueStatusFilter,
} from '@xeprime/types';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  certificateFiltersToParams,
  fetchCertificateDetail,
  fetchCertificatePricing,
  fetchCertificates,
  fetchInsuranceAttention,
  fetchInsuranceProducts,
  retryCertificate,
  updateInsuranceProduct,
  voidCertificate,
  createRemittance,
  deleteRemittance,
  fetchRemittance,
  fetchRemittanceLines,
  fetchRemittancePending,
  fetchRemittances,
  finalizeRemittance,
  payRemittance,
  remittanceFiltersToParams,
  checkInsurancePremium,
  syncInsurancePremium,
  fetchInsuranceOverview,
  fetchInsuranceVehicles,
  vehicleFiltersToParams,
} from './api';
import type {
  CertificateFilters,
  CreateInsuranceRemittanceInput,
  InsurancePremiumCheckInput,
  InsuranceVehicleFilters,
  PayInsuranceRemittanceInput,
  RemittanceFilters,
  UpdateInsuranceProductInput,
  VoidInsurancePolicyInput,
} from './types';

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

/**
 * Đồng bộ biểu phí từ hãng NGAY (ADR 0106) — ~50-60 lượt gọi API của đối tác, chỉ chạy khi bấm.
 * Xong thì làm mới danh mục (biểu phí + trạng thái khoá) và danh mục công khai.
 */
export function useSyncInsurancePremium() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncInsurancePremium(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.platformInsurance.products });
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

/** Phí thực tế của một hợp đồng — ngăn chi tiết (ADR 0091 điều 2). */
export function useCertificatePricing(id: string | null) {
  return useQuery({
    queryKey: queryKeys.platformInsurance.pricing(id ?? ''),
    queryFn: () => fetchCertificatePricing(id as string),
    enabled: Boolean(id),
  });
}

/** Hợp đồng cần xử lý gấp — khối cảnh báo đầu tab Chứng nhận (ADR 0091 điều 7). */
export function useInsuranceAttention(enabled = true) {
  return useQuery({
    queryKey: queryKeys.platformInsurance.attention,
    queryFn: fetchInsuranceAttention,
    enabled,
    staleTime: 60_000,
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
    mutationFn: ({ id, ...input }: { id: string } & VoidInsurancePolicyInput) =>
      voidCertificate(id, input),
    onSuccess: invalidate,
  });
}

// ── Bảng kê trả phí cho hãng (ADR 0088 điều 6) ──────────────────────────────

function parseRemittanceFilters(params: URLSearchParams): RemittanceFilters {
  return {
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
    remittance: params.get('remittance') || undefined,
  };
}

export function useRemittanceFilters() {
  return useUrlFilters(parseRemittanceFilters);
}

export function useRemittances(filters: RemittanceFilters) {
  const params = remittanceFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.platformInsurance.remittances(params),
    queryFn: () => fetchRemittances(filters),
    placeholderData: keepPreviousData,
  });
}

export function useRemittancePending() {
  return useQuery({
    queryKey: queryKeys.platformInsurance.remittancePending,
    queryFn: fetchRemittancePending,
  });
}

export function useRemittance(id: string | null) {
  return useQuery({
    queryKey: queryKeys.platformInsurance.remittance(id ?? ''),
    queryFn: () => fetchRemittance(id as string),
    enabled: Boolean(id),
  });
}

export function useRemittanceLines(id: string | null, page: number, limit: number) {
  return useQuery({
    queryKey: queryKeys.platformInsurance.remittanceLines(id ?? '', { page, limit }),
    queryFn: () => fetchRemittanceLines(id as string, { page, limit }),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

/** Mọi thao tác bảng kê đổi danh sách, số "chưa kê" và chi tiết — làm mới cả nhánh bảo hiểm. */
function useInvalidateInsurance() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.platformInsurance.all });
}

export function useCreateRemittance() {
  const invalidate = useInvalidateInsurance();
  return useMutation({
    mutationFn: (body: CreateInsuranceRemittanceInput) => createRemittance(body),
    onSuccess: invalidate,
  });
}

export function useFinalizeRemittance() {
  const invalidate = useInvalidateInsurance();
  return useMutation({ mutationFn: finalizeRemittance, onSuccess: invalidate });
}

export function usePayRemittance() {
  const invalidate = useInvalidateInsurance();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PayInsuranceRemittanceInput }) =>
      payRemittance(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteRemittance() {
  const invalidate = useInvalidateInsurance();
  return useMutation({ mutationFn: deleteRemittance, onSuccess: invalidate });
}

// ── Tổng quan · xe · đối chiếu biểu phí (ADR 0097) ──────────────────────────

/** Tháng đang xem của Tổng quan (`?month=YYYY-MM`) — bỏ trống = tháng hiện tại (giờ Việt Nam). */
export function useOverviewMonth() {
  return useUrlFilters((params) => {
    const month = params.get('month');
    return { month: month && /^d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : undefined };
  });
}

export function useInsuranceOverview(month: string) {
  return useQuery({
    queryKey: queryKeys.platformInsurance.overview(month),
    queryFn: () => fetchInsuranceOverview(month),
    placeholderData: keepPreviousData,
  });
}

function parseVehicleFilters(params: URLSearchParams): InsuranceVehicleFilters {
  const eligibility = params.get('eligibility');
  return {
    q: params.get('q')?.trim() || undefined,
    eligibility: (INSURANCE_VEHICLE_ELIGIBILITY_FILTER_VALUES as readonly string[]).includes(
      eligibility ?? '',
    )
      ? (eligibility as InsuranceVehicleEligibilityFilter)
      : undefined,
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
  };
}

export function useInsuranceVehicleFilters() {
  return useUrlFilters(parseVehicleFilters);
}

export function useInsuranceVehicles(filters: InsuranceVehicleFilters) {
  const params = vehicleFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.platformInsurance.vehicles(params),
    queryFn: () => fetchInsuranceVehicles(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Đối chiếu biểu phí với hãng cho MỘT xe — một LƯỢT ĐỌC (không ghi gì), nên là query: mở hộp là hỏi,
 * "Hỏi lại" là `refetch`. Không cache, không tự thử lại — mỗi lượt là một lần gọi API của đối tác.
 * (Gọi `mutate` trong effect lúc mount bị StrictMode làm rơi observer ⇒ kẹt ở pending.)
 */
export function useVehiclePremiumCheck(vehicleId: string) {
  return useQuery({
    queryKey: queryKeys.platformInsurance.premiumCheck(vehicleId),
    queryFn: () => checkInsurancePremium({ vehicleId }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Đối chiếu biểu phí với hãng — một lượt gọi ra ngoài, không cache (mỗi lần bấm là một lần hỏi). */
export function usePremiumCheck() {
  return useMutation({
    mutationFn: (body: InsurancePremiumCheckInput) => checkInsurancePremium(body),
  });
}

export type { InsurancePolicyStatus };
