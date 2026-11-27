import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  driverFiltersToParams,
  driverSharedFilterParams,
  driversApi,
  tripFiltersToParams,
  type DriverFilters,
  type DriverTripFilters,
  type InviteDriverInput,
  type UpdateDriverInput,
  type UpdateDriverWageSettingsInput,
} from '../api';

/** Số tài xế mỗi trang — cùng con số với sổ khách và nhân sự (xem `LIST_TUNING`). */
export const DRIVERS_PAGE_SIZE = 10;

/** MỘT trang liên kết tài xế. Tìm kiếm, lọc và cắt trang đều ở SERVER. */
export function useDriversPage(filters: DriverFilters, enabled = true) {
  const withLimit = { ...filters, limit: DRIVERS_PAGE_SIZE };
  const params = driverFiltersToParams(withLimit);

  return useQuery({
    queryKey: queryKeys.drivers.list(params),
    queryFn: () => driversApi.list(withLimit),
    placeholderData: keepPageData<Awaited<ReturnType<typeof driversApi.list>>>(params),
    enabled,
  });
}

/**
 * MỘT trang danh sách GỘP tài xế liên kết + nội bộ (web `useDriverRoster`, 25/11/2026). Tìm kiếm,
 * lọc, sắp và cắt trang ở SERVER; app gộp trang bằng `useAccumulatedPages` (cuộn vô hạn).
 */
export function useDriverRoster(filters: DriverFilters, enabled = true) {
  const withLimit = { ...filters, limit: DRIVERS_PAGE_SIZE };
  const params = driverFiltersToParams(withLimit);
  return useQuery({
    queryKey: queryKeys.drivers.roster(params),
    queryFn: () => driversApi.roster(withLimit),
    placeholderData: keepPageData<Awaited<ReturnType<typeof driversApi.roster>>>(params),
    enabled,
  });
}

/** Dải số đếm của danh sách gộp — theo bộ lọc chung (tìm kiếm, hình thức, vận hành). */
export function useDriverRosterSummary(filters: DriverFilters, enabled = true) {
  const params = driverSharedFilterParams(filters);
  return useQuery({
    queryKey: queryKeys.drivers.rosterSummary(params),
    queryFn: () => driversApi.rosterSummary(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/** Tra tài khoản khách theo SĐT trước khi mời — tên + ảnh (web `useDriverAccountLookup`). */
export function useDriverAccountLookup(phone: string | null) {
  return useQuery({
    queryKey: queryKeys.drivers.accountLookup(phone ?? ''),
    queryFn: () => driversApi.accountLookup(phone as string),
    enabled: Boolean(phone),
    staleTime: 60_000,
    retry: false,
  });
}

/** Dải số đếm đầu màn Tài xế — theo bộ lọc chung (tìm kiếm, hình thức, vận hành). Như web. */
export function useDriverSummary(filters: DriverFilters, enabled = true) {
  const params = driverSharedFilterParams(filters);
  return useQuery({
    queryKey: queryKeys.drivers.summary(params),
    queryFn: () => driversApi.summary(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/**
 * Mọi thao tác trên liên kết làm mới CẢ nhánh `drivers` — danh sách lẫn bộ chọn gán đơn
 * (`drivers.assignable`): người vừa bị tạm khoá phải biến khỏi bộ chọn ngay.
 */
function useDriverMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all }),
  });
}

export const useInviteDriver = () =>
  useDriverMutation((body: InviteDriverInput) => driversApi.invite(body));

export const useUpdateDriver = () =>
  useDriverMutation(({ id, body }: { id: string; body: UpdateDriverInput }) =>
    driversApi.update(id, body),
  );

export const useSuspendDriver = () => useDriverMutation((id: string) => driversApi.suspend(id));
export const useResumeDriver = () => useDriverMutation((id: string) => driversApi.resume(id));
export const useEndDriver = () => useDriverMutation((id: string) => driversApi.end(id));

/** "Đã đối chiếu" bằng lái / gỡ đánh dấu (web `useSetDriverLicenceChecked`). */
export const useSetDriverLicenceChecked = () =>
  useDriverMutation(({ id, checked }: { id: string; checked: boolean }) =>
    driversApi.setLicenceChecked(id, checked),
  );

/** Chi tiết một tài xế trong tháng — đổi tháng giữ số cũ tới khi có số mới (cùng khoá web). */
export function useDriverOverview(id: string | null, month: string | undefined) {
  return useQuery({
    queryKey: queryKeys.drivers.overview(id ?? '', { month: month ?? null }),
    queryFn: () => driversApi.overview(id as string, month),
    enabled: Boolean(id),
    placeholderData: (prev) => (prev && prev.driver.id === id ? prev : undefined),
  });
}

/**
 * Tab "Chuyến & tiền công" của chi tiết tài xế — cùng khoá của web (tháng, tìm, kết cục, trang),
 * phân trang server-side.
 */
export function useDriverAssignments(id: string | null, filters: DriverTripFilters) {
  const params = { ...tripFiltersToParams(filters), outcome: filters.status ?? null };
  return useQuery({
    queryKey: queryKeys.drivers.assignments(id ?? '', params),
    queryFn: () => driversApi.assignments(id as string, filters),
    enabled: Boolean(id),
    placeholderData: (prev) => prev,
  });
}

/** Tiền công/ngày mặc định của bên thuê + giới hạn (ADR 0075). */
export function useDriverWageSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.drivers.wageSettings,
    queryFn: driversApi.wageSettings,
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
    mutationFn: (body: UpdateDriverWageSettingsInput) => driversApi.updateWageSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.drivers.wageSettings, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}
