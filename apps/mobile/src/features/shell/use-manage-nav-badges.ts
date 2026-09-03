import { useQuery } from '@tanstack/react-query';
import { BOOKING_REQUEST_STATUS, PERMISSION } from '@xeprime/types';
import { bookingRequestsApi } from '@/features/booking-requests/api';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { queryKeys } from '@/queries/query-keys';
import { MANAGE_NAV_BADGE, type ManageNavBadge } from './manage-nav';

/** Chỉ cần `meta.total`, không cần bản ghi nào — xin một dòng cho nhẹ thân phản hồi. */
const COUNT_ONLY_LIMIT = 1;

/** Huy hiệu là con số PHỤ TRỢ: nhịp thưa là đủ, không cần bám sát từng giây. */
const BADGE_REFRESH_INTERVAL_MS = 60_000;

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
 * Tin nhắn chưa đọc trả 0: chat realtime (ADR 0009) chưa dựng ở app. Để nguyên khoá trong bảng
 * thay vì bỏ đi — ngày chat có mặt thì chỉ phải nối một query, không phải sửa cả cây menu.
 */
export function useManageNavBadges(): ManageNavBadgeCounts {
  const { data: user } = useCurrentUser();
  const permissions = usePermissions();

  /* Nhân sự nền tảng không có hai khái niệm này — tắt hẳn query thay vì gọi rồi nuốt 403. */
  const isShopScope = Boolean(user) && !user?.platformRole;
  const enabled = isShopScope && permissions.has(PERMISSION.BOOKING_REQUEST_VIEW);

  const params = {
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    page: FIRST_PAGE,
    limit: COUNT_ONLY_LIMIT,
  };

  const pending = useQuery({
    queryKey: queryKeys.bookingRequests.list(params),
    queryFn: async () => (await bookingRequestsApi.list(params)).meta.total,
    enabled,
    refetchInterval: BADGE_REFRESH_INTERVAL_MS,
  });

  return {
    [MANAGE_NAV_BADGE.BOOKING_REQUESTS_PENDING]: pending.data ?? 0,
    [MANAGE_NAV_BADGE.CHAT_UNREAD]: 0,
  };
}
