import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@xeprime/api-client';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import {
  calendarApi,
  type BulkDayBlockInput,
  type BulkDayPriceInput,
  type CalendarFilters,
} from '../api';

/**
 * Dữ liệu + thao tác cho hai tấm trượt hàng loạt mở từ thẻ ngày trên lịch.
 *
 * Bộ lọc lấy từ CHÍNH bộ lọc của lưới (+ chi nhánh của vỏ). Đó là điểm quan trọng nhất của hook
 * này: người dùng vừa lọc còn 12 xe máy rồi bấm "khoá toàn bộ xe" thì "toàn bộ" phải nghĩa là 12
 * chiếc đang nhìn thấy — không phải 40 chiếc của cả gian hàng. Tấm trượt nói rõ điều đó bằng chữ,
 * nhưng hợp đồng thì nằm ở đây.
 */
export function useBulkDayPreview(
  filters: CalendarFilters,
  from: string,
  to: string,
  enabled: boolean,
) {
  const branchScope = useBranchScopeParams();

  const query = useMemo(
    () => ({
      from,
      to,
      vehicleType: filters.vehicleType ?? null,
      q: filters.q ?? null,
      branchId: branchScope.branchId ?? null,
    }),
    [from, to, filters.vehicleType, filters.q, branchScope.branchId],
  );

  return useQuery({
    queryKey: queryKeys.calendar.bulkDayPreview(query),
    queryFn: () => calendarApi.bulkDayPreview(query),
    enabled: enabled && Boolean(from && to),
    // Xe nào bận đổi theo từng đơn mới — không giữ bản cũ khi tấm trượt mở lại.
    staleTime: 0,
  });
}

/**
 * Làm mới MỌI thứ mà một lệnh hàng loạt vừa đụng tới.
 *
 * Một lệnh chạm cả ba bề mặt cùng lúc — thanh event (khoá xe), dấu giá riêng, và hàng "Xe còn
 * trống". Invalidate cả nhánh `calendar` thay vì gọi tên từng key: sót một key nghĩa là người
 * dùng nhìn một cái lịch nói dối ngay sau khi họ vừa bấm nút.
 */
function useInvalidateCalendar() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.calendar.all });
    void client.invalidateQueries({ queryKey: queryKeys.vehicles.all });
  };
}

export function useBulkBlockDay() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: BulkDayBlockInput) => calendarApi.bulkBlockDay(body),
    onSuccess: invalidate,
  });
}

export function useReleaseBulkBlock() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (batchId: string) => calendarApi.releaseBulkBlockBatch(batchId),
    onSuccess: invalidate,
  });
}

export function useBulkPriceDay() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: BulkDayPriceInput) => calendarApi.bulkPriceDay(body),
    onSuccess: invalidate,
  });
}

export function useBulkRestoreDayPrices() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: BulkDayPriceInput) => calendarApi.bulkRestoreDayPrices(body),
    onSuccess: invalidate,
  });
}
