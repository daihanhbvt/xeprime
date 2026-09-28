import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { PERMISSION, PLAN_FEATURE, BOOKING_STATUS } from '@xeprime/types';
import { nowInAppTz } from '@xeprime/domain';
import { STALE_TIME } from '@xeprime/api-client';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import {
  bookingFiltersToParams,
  bookingsApi,
  type BookingFilters,
  type BookingListItem,
} from '@/features/bookings/api';
import {
  financeApi,
  financeRangeParams,
  receiptFiltersToParams,
  receiptsApi,
  type FinanceSummary,
  type Receipt,
} from '@/features/finance/api';
import { vehiclesApi, type FleetSummary } from '@/features/vehicles/api';
import { queryKeys } from '@/queries/query-keys';
import type { Paged } from '@xeprime/api-client';
import {
  DASHBOARD_BOOKING_LIMIT,
  DASHBOARD_RECEIPT_LIMIT,
  dashboardMonthRange,
  dashboardTodayRange,
} from '../api';

/**
 * Đội xe: tổng · sẵn sàng · đang thuê.
 *
 * Dùng `fleetSummary` — MỘT request đếm ở server trên cả đội xe — thay vì ba lần `/vehicles?limit=1`
 * như web. Cùng định nghĩa (`operationStatus`), cùng nguồn, nhưng dùng CHUNG cache với dải chỉ số
 * đầu màn Đội xe, nên mở Tổng quan rồi mở Đội xe không tốn thêm request nào.
 *
 * KHÔNG ghép scope chi nhánh: web cũng không (dashboard nói về cả gian hàng), và `fleetSummary`
 * không nhận tham số nào.
 */
export function useFleetStats(enabled: boolean): UseQueryResult<FleetSummary> {
  return useQuery({
    queryKey: queryKeys.vehicles.fleetSummary(),
    queryFn: () => vehiclesApi.fleetSummary(),
    enabled,
    staleTime: STALE_TIME.STANDARD,
  });
}

export interface DashboardBookings {
  recent: UseQueryResult<Paged<BookingListItem>>;
  dueToday: UseQueryResult<Paged<BookingListItem>>;
  upcoming: UseQueryResult<Paged<BookingListItem>>;
  /** `undefined` = chưa biết (đang tải hoặc lỗi) — KHÁC hẳn `0`. */
  activeCount: number | undefined;
  overdueCount: number | undefined;
  activeError: boolean;
  overdueError: boolean;
}

/**
 * Số liệu & danh sách đơn cho Tổng quan.
 *
 * Mốc thời gian tính MỘT lần lúc mount (`useMemo` rỗng) để query key không đổi mỗi render —
 * không có nó thì mỗi lần vẽ lại là một key mới và một vòng fetch vô tận.
 *
 * "Hết hôm nay" / "3 ngày tới" là ranh giới NGÀY VIỆT NAM, không phải ngày của máy: nếu không,
 * cùng một đơn lúc thì nằm trong ô "trả hôm nay" lúc thì không, tuỳ múi giờ điện thoại.
 *
 * Mỗi ô là một truy vấn `/bookings` CÓ PHÂN TRANG (`limit`), không kéo cả bảng về đếm ở client.
 */
export function useDashboardBookings(enabled: boolean): DashboardBookings {
  const bounds = useMemo(() => {
    const now = nowInAppTz();
    return {
      now: now.toISOString(),
      endToday: now.endOf('day').toISOString(),
      in3days: now.add(3, 'day').endOf('day').toISOString(),
    };
  }, []);

  const useList = (filters: BookingFilters) =>
    useQuery({
      queryKey: queryKeys.bookings.list(bookingFiltersToParams(filters)),
      queryFn: () => bookingsApi.list(filters),
      enabled,
      staleTime: STALE_TIME.STANDARD,
    });

  const recent = useList({ sort: 'newest', limit: DASHBOARD_BOOKING_LIMIT });
  const dueToday = useList({
    status: BOOKING_STATUS.ACTIVE,
    returnTo: bounds.endToday,
    sort: 'return_asc',
    limit: DASHBOARD_BOOKING_LIMIT,
  });
  const upcoming = useList({
    status: BOOKING_STATUS.ACTIVE,
    returnFrom: bounds.endToday,
    returnTo: bounds.in3days,
    sort: 'return_asc',
    limit: DASHBOARD_BOOKING_LIMIT,
  });
  const active = useList({ status: BOOKING_STATUS.ACTIVE, limit: 1 });
  const overdue = useList({ status: BOOKING_STATUS.ACTIVE, returnTo: bounds.now, limit: 1 });

  return {
    recent,
    dueToday,
    upcoming,
    activeCount: active.data?.meta.total,
    overdueCount: overdue.data?.meta.total,
    activeError: active.isError,
    overdueError: overdue.isError,
  };
}

export interface DashboardMoney {
  /**
   * Có hiện khối tiền không — HAI trục kiểm NỐI TIẾP (ADR 0027 điều 2): gói có tính năng
   * `finance` (`read_only` VẪN tính là có — không ai mất quyền xem sổ của chính mình vì hết hạn
   * gói, điều 3), VÀ vai người đang đăng nhập có `finance.view`.
   *
   * Đây chỉ là lớp trải nghiệm; `/finance/summary` và `/receipts` đã có `@RequiresFeature` +
   * `@RequirePermissions` ở server (điều 4).
   */
  visible: boolean;
  summary: UseQueryResult<FinanceSummary>;
  todayReceipts: UseQueryResult<Paged<Receipt>>;
}

/**
 * Tiền THẬT của Tổng quan: doanh thu THÁNG NÀY, cọc đang giữ, và sổ quỹ HÔM NAY.
 *
 * Bậc cơ bản không có sổ tổng hợp (ADR 0027 điều 1) — khi đó `visible` là `false` và hai truy vấn
 * KHÔNG chạy, thay vì chạy rồi nuốt 403. `enabled` là chỗ duy nhất quyết định điều đó, nên không
 * có đường nào để một thẻ tiền hiện lên rỗng mà trông như "chưa có doanh thu".
 *
 * Dùng lại `financeApi.summary` của màn Tổng quan doanh thu chứ không thêm một endpoint
 * "dashboard summary": hai bề mặt cộng cùng một phép tính thì không được có hai đường tính.
 */
export function useDashboardMoney(): DashboardMoney {
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const { has } = usePermissions();
  const visible = finance.isVisible && has(PERMISSION.FINANCE_VIEW);

  const monthRange = dashboardMonthRange();
  const receiptFilters = {
    ...dashboardTodayRange(),
    page: 1,
    limit: DASHBOARD_RECEIPT_LIMIT,
  };

  const summary = useQuery({
    queryKey: queryKeys.finance.summary(financeRangeParams(monthRange)),
    queryFn: () => financeApi.summary(monthRange),
    enabled: visible,
    staleTime: STALE_TIME.STANDARD,
  });

  const todayReceipts = useQuery({
    queryKey: queryKeys.receipts.list(receiptFiltersToParams(receiptFilters)),
    queryFn: () => receiptsApi.list(receiptFilters),
    enabled: visible,
    staleTime: STALE_TIME.STANDARD,
  });

  return { visible, summary, todayReceipts };
}
