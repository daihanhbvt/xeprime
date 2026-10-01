'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  bulkBlockDay,
  bulkPriceDay,
  bulkRestoreDayPrices,
  fetchBulkDayPreview,
  releaseBulkBlockBatch,
} from '../api';
import type { BulkDayBlockInput, BulkDayPriceInput } from '../types/calendar.types';
import { useCalendarFilters } from './use-calendar-filters';

/**
 * Dữ liệu + thao tác cho hai dialog hàng loạt mở từ thẻ ngày trên lịch.
 *
 * Bộ lọc lấy từ CHÍNH bộ lọc của lưới (`useCalendarFilters`) — TOÀN BỘ nó, chi nhánh gồm trong
 * đó. Đó là điểm quan trọng nhất của hook này: người dùng vừa lọc còn 12 xe máy rồi bấm "khoá
 * toàn bộ xe" thì "toàn bộ" phải nghĩa là 12 chiếc đang nhìn thấy — không phải 40 chiếc của cả
 * gian hàng. Dialog nói rõ điều đó bằng chữ, nhưng hợp đồng thì nằm ở đây.
 *
 * Đây là một thao tác GHI hàng loạt (chiếm `vehicle_occupancies`, đặt giá riêng), nên sót một vế
 * của bộ lọc không phải một lỗi hiển thị: nó khoá xe của những chi nhánh người dùng còn không mở
 * ra xem. Mọi vế phải đến từ cùng một nguồn với lưới, và nguồn đó là URL (ADR 0052).
 */
export function useBulkDayPreview(from: string, to: string, enabled: boolean) {
  const { filters } = useCalendarFilters();

  const query = {
    from,
    to,
    ...(filters.vehicleType ? { vehicleType: filters.vehicleType } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
  };

  return useQuery({
    queryKey: queryKeys.calendar.bulkDayPreview(query),
    queryFn: () => fetchBulkDayPreview(query),
    enabled: enabled && Boolean(from && to),
    // Xe nào bận đổi theo từng đơn mới — không giữ bản cũ khi dialog mở lại.
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
    mutationFn: (body: BulkDayBlockInput) => bulkBlockDay(body),
    onSuccess: invalidate,
  });
}

export function useReleaseBulkBlock() {
  const invalidate = useInvalidateCalendar();
  // Cùng chi nhánh với bảng xem trước đã báo công tắc đang bật — gỡ đúng phần đang nhìn thấy.
  const { filters } = useCalendarFilters();
  return useMutation({
    mutationFn: (batchId: string) => releaseBulkBlockBatch(batchId, filters.branchId ?? undefined),
    onSuccess: invalidate,
  });
}

export function useBulkPriceDay() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: BulkDayPriceInput) => bulkPriceDay(body),
    onSuccess: invalidate,
  });
}

export function useBulkRestoreDayPrices() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: BulkDayPriceInput) => bulkRestoreDayPrices(body),
    onSuccess: invalidate,
  });
}
