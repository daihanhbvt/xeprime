import { useCallback, useMemo, useState } from 'react';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import type { Href } from 'expo-router';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CUSTOMER_TRIP_FILTER,
  PERMISSION,
  PLAN_FEATURE,
  TENANT_ROLE,
  VEHICLE_OPERATION_STATUS,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { STALE_TIME, type Paged } from '@xeprime/api-client';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { withBranchParam } from '@/features/branches/branch-link';
import {
  financeApi,
  financeRangeParams,
  financeSeriesParams,
  receiptFiltersToParams,
  receiptsApi,
  type FinanceSeries,
  type FinanceSummary,
  type Receipt,
} from '@/features/finance/api';
import { isCommissionOwner } from '@/features/shell/partner-track';
import type { BookingSort } from '@/features/bookings/api';
import { vehiclesApi, type FleetSummary } from '@/features/vehicles/api';
import { ROUTES } from '@/navigation/routes';
import { queryKeys } from '@/queries/query-keys';
import {
  DASHBOARD_RECEIPT_LIMIT,
  dashboardApi,
  dashboardMonthRange,
  dashboardPreviousMonthToDateRange,
  dashboardRevenueSeriesFilters,
  dashboardTodayRange,
  partnerOverviewParams,
  type PartnerOverview,
} from '../api';
import { answerParts } from '../dashboard-model';

/**
 * Đội xe: tổng · sẵn sàng · đang thuê · bảo dưỡng — `fleetSummary`, MỘT request đếm ở server, dùng
 * CHUNG cache với dải chỉ số màn Đội xe. Theo chi nhánh đang lọc (ADR 0052).
 */
export function useFleetStats(enabled: boolean, branchId?: string): UseQueryResult<FleetSummary> {
  const params = branchId ? { branchId } : {};
  return useQuery({
    queryKey: queryKeys.vehicles.fleetSummary(params),
    queryFn: () => vehiclesApi.fleetSummary(params),
    enabled,
    staleTime: STALE_TIME.STANDARD,
  });
}

/**
 * Nhịp tự làm mới của Tổng quan — "việc cần làm" đổi theo PHÚT (hạn trả lời, quá giờ giao xe).
 * Thông báo realtime đã làm mới nhánh `dashboard` (`notification-refresh.ts`); nhịp này là lưới
 * an toàn cho thứ chỉ đổi vì THỜI GIAN trôi. Cùng nhịp với web.
 */
const OVERVIEW_REFRESH_MS = 60_000;

/**
 * `GET /dashboard/overview` — phần vận hành của Tổng quan, cả hai tuyến. Tenant scope do backend
 * lấy từ phiên; `branchId` chỉ thu hẹp trong gian hàng (ADR 0052). `placeholderData` giữ số cũ
 * trong lúc đổi chi nhánh để các thẻ không nháy về trạng thái tải.
 */
export function usePartnerOverview(branchId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.overview(partnerOverviewParams(branchId)),
    queryFn: () => dashboardApi.overview(branchId),
    enabled,
    staleTime: STALE_TIME.TRANSACTIONAL,
    refetchInterval: OVERVIEW_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

/**
 * Các nhánh cache mà MỌI panel của Tổng quan đọc — kéo để làm mới phải chạm hết, không chỉ phiên +
 * overview: doanh thu/biểu đồ (`finance`), phiếu thu hôm nay (`receipts`), đội xe/xe gần đây
 * (`vehicles`), ví (`wallet`), gói (`subscription`), thẻ hồ sơ gian hàng (`shop`).
 */
const DASHBOARD_REFRESH_KEYS = [
  queryKeys.auth.all,
  queryKeys.dashboard.all,
  queryKeys.finance.all,
  queryKeys.receipts.all,
  queryKeys.vehicles.all,
  queryKeys.wallet.all,
  queryKeys.subscription.all,
  queryKeys.shop.all,
] as const;

/**
 * Kéo để làm mới Tổng quan — invalidate mọi nhánh trên (chỉ query ĐANG HIỆN mới gọi lại mạng) và
 * giữ spinner tới khi TẤT CẢ xong, kể cả khi một nhánh lỗi (lỗi đã hiện ở chính panel đó).
 */
export function useDashboardRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.allSettled(
      DASHBOARD_REFRESH_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ).finally(() => setRefreshing(false));
  }, [queryClient]);
  return { refreshing, onRefresh };
}

/** Dấu ngăn các vế của câu trả lời — dấu câu trung tính, đúng ở cả hai ngôn ngữ. */
const PART_SEPARATOR = ' · ';

/**
 * Câu trả lời đầu trang — dựng từ CHÍNH số liệu của các ô việc bên dưới, nên câu và ô không bao
 * giờ nói hai điều khác nhau. `null` khi chưa có dữ liệu hoặc không được xem đơn lẫn yêu cầu.
 */
export function useDashboardAnswer(
  overview: PartnerOverview | undefined,
): { text: string; busy: boolean } | null {
  const t = useTranslations('Dashboard.answer');
  if (!overview) return null;
  const parts = answerParts(overview);
  if (parts === null) return null;
  if (parts.length === 0) return { text: t('calm'), busy: false };
  const text = parts.map((part) => t(part.key, { count: part.count })).join(PART_SEPARATOR);
  return { text: t('busy', { parts: text }), busy: true };
}

export interface DashboardLinks {
  requests: Href;
  awaitingPayment: Href;
  awaitingPickup: Href;
  active: Href;
  allBookings: Href;
  completed: Href;
  calendar: Href;
  availableVehicles: Href;
  booking: (id: string) => Href;
  vehicles: Href;
  vehiclesByPublicStatus: (status: VehiclePublicStatus) => Href;
  vehicle: (id: string) => Href;
  vehicleNew: Href;
  subscription: Href;
  balance: Href;
}

/**
 * Đích của MỌI thẻ trên Tổng quan — bản native của `useDashboardLinks` bên web.
 *
 *  - CHỦ xe tuyến hoa hồng đọc yêu cầu + đơn gộp ở "Chuyến cho thuê" — trỏ thẳng vào đó;
 *  - thành viên và tuyến gói dùng hộp thư + bảng đơn / màn "Chờ giao xe".
 *
 * Bộ lọc đi trên THAM SỐ ROUTE cùng tên với query web (`status`, `sort`, `filter`,
 * `operationStatus`, `publicStatus`) — màn danh sách đọc chúng làm giá trị KHỞI TẠO
 * (`useListParam`), người dùng vẫn đổi được. Chi nhánh đi theo (`withBranchParam`, ADR 0052).
 */
/** Thẻ "Đang thuê" — xe về sớm nhất trước, như web. */
const ACTIVE_SORT: BookingSort = 'return_asc';

export function useDashboardLinks(branchId?: string): DashboardLinks {
  const { data: user } = useCurrentUser();
  const ownerTrips = isCommissionOwner(user);

  return useMemo(() => {
    const branch = (href: Href) => withBranchParam(href, branchId ?? null);
    const m = ROUTES.manage;
    const trips = m.trips();
    return {
      requests: ownerTrips ? trips : branch(m.requests()),
      awaitingPayment: ownerTrips
        ? trips
        : branch(m.requests({ status: BOOKING_REQUEST_STATUS.AWAITING_HOLD })),
      awaitingPickup: ownerTrips ? trips : branch(m.bookingsAwaitingPickup()),
      active: ownerTrips
        ? trips
        : branch(m.bookings({ status: BOOKING_STATUS.ACTIVE, sort: ACTIVE_SORT })),
      allBookings: ownerTrips ? trips : branch(m.bookings()),
      completed: ownerTrips
        ? m.trips({ filter: CUSTOMER_TRIP_FILTER.HISTORY })
        : branch(m.bookings({ status: BOOKING_STATUS.COMPLETED })),
      calendar: branch(m.calendar()),
      availableVehicles: branch(m.vehicles({ operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE })),
      booking: (id: string) => m.bookingDetail(id),
      vehicles: branch(m.vehicles()),
      vehiclesByPublicStatus: (publicStatus: VehiclePublicStatus) =>
        branch(m.vehicles({ publicStatus })),
      vehicle: (id: string) => m.vehicleDetail(id),
      vehicleNew: m.vehicleNew(),
      subscription: m.plan(),
      balance: m.balance(),
    };
  }, [branchId, ownerTrips]);
}

/**
 * CHỦ gian hàng — ví là của chủ (`@ShopOwnerOnly`, ADR 0038 điều 3); thành viên không có ví.
 * Cùng phép với web `isShopOwner` (`constants/account-nav.ts`). KHÔNG thay bằng
 * `walletScopeFor(user) === SHOP`: hàm đó hỏi REALM trước, phiên thiếu `realm` sẽ bị coi là ví khách.
 */
export function useIsShopOwner(): boolean {
  const { data: user } = useCurrentUser();
  return user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
}

export interface DashboardMoney {
  /**
   * Có hiện khối tiền không — HAI trục kiểm NỐI TIẾP (ADR 0027 điều 2): gói có tính năng
   * `finance` (`read_only` VẪN tính là có, điều 3), VÀ vai có `finance.view`. Chỉ là lớp trải
   * nghiệm; server đã gác `@RequiresFeature` + `@RequirePermissions` (điều 4).
   */
  visible: boolean;
  summary: UseQueryResult<FinanceSummary>;
  /** Cùng phép tính, CÙNG KỲ tháng trước — mẫu số của mũi tên tăng/giảm. */
  previousSummary: UseQueryResult<FinanceSummary>;
  /** Doanh thu · chi phí · lợi nhuận theo ngày, `DASHBOARD_REVENUE_DAYS` ngày gần nhất. */
  series: UseQueryResult<FinanceSeries>;
  todayReceipts: UseQueryResult<Paged<Receipt>>;
}

/**
 * Tiền THẬT của Tổng quan tuyến gói — tất cả đọc từ sổ thu chi, cùng endpoint (và cùng khoá cache)
 * với màn Tổng quan doanh thu. Bậc không có sổ tổng hợp (ADR 0027 điều 1) ⇒ `visible = false` và
 * các truy vấn KHÔNG chạy, thay vì chạy rồi nuốt 403.
 */
export function useDashboardMoney(branchId?: string): DashboardMoney {
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const { has } = usePermissions();
  const visible = finance.isVisible && has(PERMISSION.FINANCE_VIEW);

  const monthRange = { ...dashboardMonthRange(), branchId };
  const previousRange = { ...dashboardPreviousMonthToDateRange(), branchId };
  const seriesFilters = dashboardRevenueSeriesFilters(branchId);
  const receiptFilters = {
    ...dashboardTodayRange(),
    branchId,
    page: 1,
    limit: DASHBOARD_RECEIPT_LIMIT,
  };

  const summary = useQuery({
    queryKey: queryKeys.finance.summary(financeRangeParams(monthRange)),
    queryFn: () => financeApi.summary(monthRange),
    enabled: visible,
    staleTime: STALE_TIME.STANDARD,
  });

  const previousSummary = useQuery({
    queryKey: queryKeys.finance.summary(financeRangeParams(previousRange)),
    queryFn: () => financeApi.summary(previousRange),
    enabled: visible,
    // Quá khứ không đổi theo phút — chỉ một phiếu duyệt muộn mới làm nó nhúc nhích.
    staleTime: STALE_TIME.REFERENCE,
  });

  const series = useQuery({
    queryKey: queryKeys.finance.series(financeSeriesParams(seriesFilters)),
    queryFn: () => financeApi.series(seriesFilters),
    enabled: visible,
    staleTime: STALE_TIME.STANDARD,
  });

  const todayReceipts = useQuery({
    queryKey: queryKeys.receipts.list(receiptFiltersToParams(receiptFilters)),
    queryFn: () => receiptsApi.list(receiptFilters),
    enabled: visible,
    staleTime: STALE_TIME.STANDARD,
  });

  return { visible, summary, previousSummary, series, todayReceipts };
}
