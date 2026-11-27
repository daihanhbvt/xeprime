'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  endDriver,
  fetchAssignableDrivers,
  fetchDriverAssignments,
  fetchDriverOverview,
  fetchDriverRoster,
  fetchDriverRosterSummary,
  fetchDriverWageSettings,
  inviteDriver,
  lookupDriverAccount,
  resumeDriver,
  rosterFiltersToParams,
  setDriverLicenceChecked,
  sharedFilterParams,
  suspendDriver,
  tripFiltersToParams,
  updateDriver,
  updateDriverWageSettings,
} from '../api';
import type {
  DriverFilters,
  DriverTripFilters,
  InviteDriverInput,
  UpdateDriverInput,
  UpdateDriverWageSettingsInput,
} from '../types';

/** Danh sách GỘP liên kết + nội bộ của màn Tài xế (phân trang/lọc server-side). */
export function useDriverRoster(filters: DriverFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.drivers.roster(rosterFiltersToParams(filters)),
    queryFn: () => fetchDriverRoster(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/** Dải số đếm đầu màn Tài xế — theo bộ lọc chung (tìm kiếm, hình thức, vận hành). */
export function useDriverRosterSummary(filters: DriverFilters, enabled = true) {
  const params = sharedFilterParams(filters);
  return useQuery({
    queryKey: queryKeys.drivers.rosterSummary(params),
    queryFn: () => fetchDriverRosterSummary(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/**
 * Tra tài khoản theo SĐT ở hộp "Mời tài xế" — chỉ chạy khi số đã đủ hình dạng di động VN. Kết quả
 * giữ một phút: gõ lại đúng số không tốn thêm lượt (server giới hạn số lượt tra mỗi phút).
 */
export function useDriverAccountLookup(phone: string | null) {
  return useQuery({
    queryKey: queryKeys.drivers.accountLookup(phone ?? ''),
    queryFn: () => lookupDriverAccount(phone as string),
    enabled: Boolean(phone),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Bộ chọn "gán tài xế vào đơn": server trả CẢ người bận trong khung giờ (disable, không nói bận
 * ở đâu) kèm trạng thái bằng lái; backend vẫn kiểm lại trong transaction.
 */
export function useAssignableDrivers(
  window: { pickupAt: string; returnAt: string; excludeBookingId?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.drivers.assignable(window),
    queryFn: () => fetchAssignableDrivers(window),
    enabled,
    staleTime: 30_000,
  });
}

function useDriverMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all }),
  });
}

export const useInviteDriver = () =>
  useDriverMutation((body: InviteDriverInput) => inviteDriver(body));

export const useUpdateDriver = () =>
  useDriverMutation(({ id, body }: { id: string; body: UpdateDriverInput }) =>
    updateDriver(id, body),
  );

export const useSuspendDriver = () => useDriverMutation((id: string) => suspendDriver(id));
export const useResumeDriver = () => useDriverMutation((id: string) => resumeDriver(id));
export const useEndDriver = () => useDriverMutation((id: string) => endDriver(id));
export const useSetDriverLicenceChecked = () =>
  useDriverMutation(({ id, checked }: { id: string; checked: boolean }) =>
    setDriverLicenceChecked(id, checked),
  );

/** Tiền công/ngày mặc định của gian hàng + giới hạn (ADR 0075). */
export function useDriverWageSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.drivers.wageSettings,
    queryFn: fetchDriverWageSettings,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Đặt / xoá mức mặc định. Làm mới cả nhánh `bookings`: gợi ý tiền công của hộp gán (khoá dưới
 * chi tiết đơn) đọc mức này.
 */
export function useUpdateDriverWageSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateDriverWageSettingsInput) => updateDriverWageSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.drivers.wageSettings, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

/** Trang chi tiết một tài xế trong tháng — đổi tháng giữ số cũ tới khi có số mới. */
export function useDriverOverview(id: string | null, month: string | undefined) {
  return useQuery({
    queryKey: queryKeys.drivers.overview(id ?? '', { month: month ?? null }),
    queryFn: () => fetchDriverOverview(id as string, month),
    enabled: Boolean(id),
    placeholderData: (prev) => (prev && prev.driver.id === id ? prev : undefined),
  });
}

/** Bảng "Chuyến & tiền công" của trang chi tiết tài xế (tìm, lọc, phân trang server-side). */
export function useDriverAssignments(id: string | null, filters: DriverTripFilters) {
  const params = { ...tripFiltersToParams(filters), outcome: filters.status ?? null };
  return useQuery({
    queryKey: queryKeys.drivers.assignments(id ?? '', params),
    queryFn: () => fetchDriverAssignments(id as string, filters),
    enabled: Boolean(id),
    placeholderData: (prev) => prev,
  });
}
