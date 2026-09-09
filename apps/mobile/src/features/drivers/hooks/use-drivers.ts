import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  driverFiltersToParams,
  driversApi,
  type CreateDriverInput,
  type DriverFilters,
  type UpdateDriverInput,
} from '../api';

/** Số tài xế mỗi trang — cùng con số với sổ khách và nhân sự (xem `LIST_TUNING`). */
export const DRIVERS_PAGE_SIZE = 10;

/** MỘT trang tài xế. Tìm kiếm, lọc và cắt trang đều ở SERVER. */
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
 * Làm mới MỌI bề mặt tài xế sau một thay đổi.
 *
 * Nhánh `drivers` bao CẢ danh sách hồ sơ lẫn bộ chọn gán đơn (`drivers.assignable`) — hai bề mặt
 * của cùng một tập dữ liệu. Bỏ sót bộ chọn thì tài xế vừa tạo không xuất hiện ở màn gán, còn
 * người vừa bị ngừng vẫn gán được — đúng hai lỗi mà SHP-06 phải đóng.
 */
function useInvalidateDrivers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all });
}

export function useCreateDriver() {
  const invalidate = useInvalidateDrivers();
  return useMutation({
    mutationFn: (body: CreateDriverInput) => driversApi.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateDriver() {
  const invalidate = useInvalidateDrivers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDriverInput }) =>
      driversApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteDriver() {
  const invalidate = useInvalidateDrivers();
  return useMutation({
    mutationFn: (id: string) => driversApi.remove(id),
    onSuccess: invalidate,
  });
}
