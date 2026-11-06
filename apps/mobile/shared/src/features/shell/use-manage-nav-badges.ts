import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { PERMISSION } from '@xeprime/types';
import { dashboardApi } from '@/api/dashboard/api';
import { vehiclesApi } from '@/api/vehicles/api';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useOnBadgeSignal } from '@/features/badges/hooks/use-on-badge-signal';
import { useAppActive, useRefetchOnForeground } from '@/hooks/use-app-active';
import { queryKeys } from '@/queries/query-keys';
import { MANAGE_NAV_BADGE, type ManageNavBadge } from './manage-nav';

/** Huy hiệu là con số PHỤ TRỢ: nhịp thưa là đủ, không cần bám sát từng giây. */
const BADGE_REFRESH_INTERVAL_MS = 60_000;

/** Nhịp khi ĐANG nghe được bản chiếu — chỉ để bắt trường hợp worker chết hoặc bản chiếu lệch. */
const BADGE_SAFETY_NET_MS = 180_000;

/** Xe có việc chặn đổi chậm (giấy tờ, bảo dưỡng) — cùng nhịp 5 phút của web. */
const VEHICLE_NEEDS_ACTION_REFRESH_MS = 5 * 60_000;

export type ManageNavBadgeCounts = Readonly<Record<ManageNavBadge, number>>;

/**
 * Con số trên các mục menu quản lý — CHỈ những thứ đang chờ người dùng xử lý.
 *
 * Cùng hai nguồn với `useNavBadges` của web, và cùng lý do: yêu cầu đặt xe chờ duyệt là khách
 * đang đợi câu trả lời, để lâu là mất đơn. Không có huy hiệu cho "số xe" hay "số khách" — đó là
 * thống kê, mà thống kê nhét lên menu thì mục nào cũng sáng và không mục nào còn báo được gì.
 *
 * Đếm ở SERVER: các endpoint đếm riêng của huy hiệu (`/dashboard/requests`, `/dashboard/today`,
 * `/vehicles/needs-action-count`) — không tải danh sách nào chỉ để hiện một con số.
 *
 * Tin nhắn chưa đọc đếm phía GIAN HÀNG (`CHAT_SIDE.SHOP`), không phải tổng hai vai: mục menu
 * này mở đúng inbox gian hàng, và một con số gộp cả hộp thư khách sẽ báo 3 rồi mở ra không có
 * tin nào. Cùng nguồn và cùng `side` với `useNavBadges` của web.
 */
export function useManageNavBadges(): ManageNavBadgeCounts {
  const { data: user } = useCurrentUser();
  const permissions = usePermissions();

  /* Nhân sự nền tảng không có hai khái niệm này — tắt hẳn query thay vì gọi rồi nuốt 403. */
  const isShopScope = Boolean(user) && !user?.platformRole;
  const requestsEnabled = isShopScope && permissions.has(PERMISSION.BOOKING_REQUEST_VIEW);
  const handoversEnabled = isShopScope && permissions.has(PERMISSION.BOOKING_VIEW);
  const vehiclesEnabled = isShopScope && permissions.has(PERMISSION.VEHICLE_VIEW);

  /*
   * Đếm TOÀN GIAN HÀNG, không theo chi nhánh (ADR 0052 điều 7): huy hiệu sống ở vỏ app và hiện ở
   * mọi màn, kể cả màn không có ô lọc chi nhánh nào. Nợ đã biết (điều 5c): đang lọc một chi nhánh
   * có thể thấy huy hiệu "2" mà hộp thư mở ra rỗng.
   */

  /*
   * Con số chat đến từ `/me/badges` — MỘT query cho cả khung ứng dụng, dùng chung với
   * biểu tượng chat trên thanh trên (`useChatBadge`) và chuông thông báo.
   *
   * `chatShop` gộp mọi gian hàng người này là thành viên active, và là con số DÙNG CHUNG
   * của gian hàng: một nhân viên đọc là cả đội hết chưa đọc. Đúng như vậy — đó là hộp thư
   * công việc, không phải hộp thư riêng của từng người.
   */
  const badges = useBadges();
  const { live } = useBadgeRealtime();
  const queryClient = useQueryClient();

  /*
   * Nhịp poll phải TẮT khi app xuống nền. `refetchInterval` của TanStack không tự dừng theo
   * `AppState`: React Native không có `document.visibilityState` nên `focusManager` luôn coi app
   * là đang focus.
   */
  const active = useAppActive();

  /*
   * Yêu cầu thuê mới LUÔN đi kèm một thông báo cho thành viên gian hàng, nên
   * `notificationsUnread` đổi là tín hiệu đủ tốt để tải lại con số này ngay — thay vì đợi
   * hết nhịp một phút.
   *
   * Invalidate cả nhánh `bookingRequests`: hộp thư yêu cầu cũng cần nhảy theo, không
   * riêng huy hiệu.
   */
  /*
   * Bốn nguồn y như `useNavBadges` web (04/11/2026): yêu cầu chờ duyệt (`/dashboard/requests`),
   * lượt giao + trả ĐẾN HẠN (`/dashboard/today` — `pickupsDue + returnsDue`), xe có việc chặn
   * (`/vehicles/needs-action-count`) và tin chưa đọc phía gian hàng. Cùng query key với web.
   */
  useOnBadgeSignal((counts) => counts.notificationsUnread, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.requests });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.today });
    // Web `notification-refresh.ts` làm mới cả nhánh xe — huy hiệu xe cần xử lý không chờ 5 phút.
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.needsActionCount() });
  });
  const interval = active ? (live ? BADGE_SAFETY_NET_MS : BADGE_REFRESH_INTERVAL_MS) : false;
  const handovers = useQuery({
    queryKey: queryKeys.dashboard.today,
    queryFn: () => dashboardApi.today(),
    enabled: handoversEnabled,
    refetchInterval: interval,
  });
  const vehicles = useQuery({
    queryKey: queryKeys.vehicles.needsActionCount(),
    queryFn: () => vehiclesApi.needsActionCount(),
    enabled: vehiclesEnabled,
    staleTime: 60_000,
    refetchInterval: active ? VEHICLE_NEEDS_ACTION_REFRESH_MS : false,
  });
  const pending = useQuery({
    queryKey: queryKeys.dashboard.requests,
    queryFn: () => dashboardApi.requests(),
    enabled: requestsEnabled,
    /*
     * Nghe được bản chiếu thì nhịp này chỉ còn là LƯỚI AN TOÀN — tín hiệu ở trên đã lo
     * phần "nhảy số ngay". Không nghe được thì giữ nhịp một phút như trước.
     */
    refetchInterval: active ? (live ? BADGE_SAFETY_NET_MS : BADGE_REFRESH_INTERVAL_MS) : false,
  });

  // Mở lại app là lúc con số dễ sai nhất: hỏi NGAY, không chờ hết nhịp.
  const { refetch } = pending;
  const { refetch: refetchHandovers } = handovers;
  const { refetch: refetchVehicles } = vehicles;
  useRefetchOnForeground(
    useCallback(() => {
      void refetch();
      void refetchHandovers();
      void refetchVehicles();
    }, [refetch, refetchHandovers, refetchVehicles]),
  );

  return {
    [MANAGE_NAV_BADGE.BOOKING_REQUESTS_PENDING]: requestsEnabled ? (pending.data?.pending ?? 0) : 0,
    [MANAGE_NAV_BADGE.CHAT_UNREAD]: badges.chatShop,
    [MANAGE_NAV_BADGE.HANDOVERS_DUE]:
      handoversEnabled && handovers.data
        ? handovers.data.pickupsDue + handovers.data.returnsDue
        : 0,
    [MANAGE_NAV_BADGE.VEHICLES_NEEDS_ACTION]: vehiclesEnabled ? (vehicles.data?.count ?? 0) : 0,
  };
}

export type ManageNavBadgeUrgency = Readonly<Partial<Record<ManageNavBadge, boolean>>>;

/**
 * Huy hiệu nào đang KHẨN — vẽ đỏ thay vì màu thương hiệu (web `NavBadges.urgent`, 04/11/2026):
 * yêu cầu sắp hết hạn trả lời (`pendingUrgent`), lượt giao/trả đã quá giờ (`*Overdue`).
 *
 * Chỉ ĐỌC cache mà `useManageNavBadges` đã nạp (`enabled: false` vẫn theo dõi query) — không
 * phát thêm request nào và không nhân đôi nhịp poll.
 */
export function useManageNavBadgeUrgency(): ManageNavBadgeUrgency {
  const requests = useQuery({
    queryKey: queryKeys.dashboard.requests,
    queryFn: () => dashboardApi.requests(),
    enabled: false,
  });
  const today = useQuery({
    queryKey: queryKeys.dashboard.today,
    queryFn: () => dashboardApi.today(),
    enabled: false,
  });
  const requestsUrgent = (requests.data?.pendingUrgent ?? 0) > 0;
  const handoversUrgent =
    (today.data?.pickupsOverdue ?? 0) + (today.data?.returnsOverdue ?? 0) > 0;
  // Ổn định danh tính — ngăn kéo dựng lại cây mục theo `useMemo` trên object này.
  return useMemo(
    () => ({
      [MANAGE_NAV_BADGE.BOOKING_REQUESTS_PENDING]: requestsUrgent,
      [MANAGE_NAV_BADGE.HANDOVERS_DUE]: handoversUrgent,
    }),
    [requestsUrgent, handoversUrgent],
  );
}
