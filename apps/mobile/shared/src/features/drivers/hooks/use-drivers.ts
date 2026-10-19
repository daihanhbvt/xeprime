import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  driverFiltersToParams,
  driversApi,
  type DriverFilters,
  type InviteDriverInput,
  type UpdateDriverInput,
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
