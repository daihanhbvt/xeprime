import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { BOOKING_REQUEST_STATUS, PERMISSION } from '@xeprime/types';
import { bookingRequestFiltersToParams, bookingRequestsApi } from '@/features/booking-requests/api';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useOnBadgeChange } from '@/features/badges/hooks/use-on-badge-change';
import { useAppActive, useRefetchOnForeground } from '@/hooks/use-app-active';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { queryKeys } from '@/queries/query-keys';
import { MANAGE_NAV_BADGE, type ManageNavBadge } from './manage-nav';

/** Chỉ cần `meta.total`, không cần bản ghi nào — xin một dòng cho nhẹ thân phản hồi. */
const COUNT_ONLY_LIMIT = 1;

/** Huy hiệu là con số PHỤ TRỢ: nhịp thưa là đủ, không cần bám sát từng giây. */
const BADGE_REFRESH_INTERVAL_MS = 60_000;

/** Nhịp khi ĐANG nghe được bản chiếu — chỉ để bắt trường hợp worker chết hoặc bản chiếu lệch. */
const BADGE_SAFETY_NET_MS = 180_000;

export type ManageNavBadgeCounts = Readonly<Record<ManageNavBadge, number>>;

/**
 * Con số trên các mục menu quản lý — CHỈ những thứ đang chờ người dùng xử lý.
 *
 * Cùng hai nguồn với `useNavBadges` của web, và cùng lý do: yêu cầu đặt xe chờ duyệt là khách
 * đang đợi câu trả lời, để lâu là mất đơn. Không có huy hiệu cho "số xe" hay "số khách" — đó là
 * thống kê, mà thống kê nhét lên menu thì mục nào cũng sáng và không mục nào còn báo được gì.
 *
 * Đếm ở SERVER: lấy `meta.total` của chính danh sách đã lọc `pending_host_approval` với
 * `limit: 1`. Con số đúng kể cả khi có hàng trăm yêu cầu, mà thân phản hồi chỉ mang một bản ghi —
 * không tải cả inbox chỉ để hiện một con số, và không cộng ở client.
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
  const enabled = isShopScope && permissions.has(PERMISSION.BOOKING_REQUEST_VIEW);

  /*
   * Đếm theo ĐÚNG scope chi nhánh mà hộp thư đang dùng — nếu không thì huy hiệu báo 5 trong khi
   * danh sách mở ra chỉ có 2, và người dùng đi tìm ba yêu cầu không tồn tại.
   */
  const branchScope = useBranchScopeParams();
  const filters = {
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    page: FIRST_PAGE,
    limit: COUNT_ONLY_LIMIT,
    ...branchScope,
  };

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
   * Vì sao không đưa thẳng con số này vào bản chiếu huy hiệu: nó bị THU HẸP theo chi nhánh
   * đang chọn, một trạng thái chỉ tồn tại ở client (ADR 0034 điều 2). Một con số toàn tài
   * khoản sẽ nói khác danh sách mà người dùng mở ra. Nên bản chiếu chỉ làm TÍN HIỆU, còn
   * con số vẫn đến từ query đúng scope.
   *
   * Invalidate cả nhánh `bookingRequests`: hộp thư yêu cầu cũng cần nhảy theo, không
   * riêng huy hiệu.
   */
  useOnBadgeChange(badges.notificationsUnread, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all });
  });

  const pending = useQuery({
    queryKey: queryKeys.bookingRequests.list(bookingRequestFiltersToParams(filters)),
    queryFn: async () => (await bookingRequestsApi.list(filters)).meta.total,
    enabled,
    /*
     * Nghe được bản chiếu thì nhịp này chỉ còn là LƯỚI AN TOÀN — tín hiệu ở trên đã lo
     * phần "nhảy số ngay". Không nghe được thì giữ nhịp một phút như trước.
     */
    refetchInterval: active ? (live ? BADGE_SAFETY_NET_MS : BADGE_REFRESH_INTERVAL_MS) : false,
  });

  // Mở lại app là lúc con số dễ sai nhất: hỏi NGAY, không chờ hết nhịp.
  const { refetch } = pending;
  useRefetchOnForeground(useCallback(() => void refetch(), [refetch]));

  return {
    [MANAGE_NAV_BADGE.BOOKING_REQUESTS_PENDING]: pending.data ?? 0,
    [MANAGE_NAV_BADGE.CHAT_UNREAD]: badges.chatShop,
  };
}
