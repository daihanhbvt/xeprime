import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  driverFiltersToParams,
  driversApi,
  type DriverFilters,
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
 * Tab "Chuyến & tiền công" của chi tiết tài xế — cùng khoá trang của web
 * (`{ month, page }`), phân trang server-side.
 */
export function useDriverAssignments(id: string | null, month: string | undefined, page: number) {
  const params = { month: month ?? null, page };
  return useQuery({
    queryKey: queryKeys.drivers.assignments(id ?? '', params),
    queryFn: () => driversApi.assignments(id as string, { month, page }),
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
