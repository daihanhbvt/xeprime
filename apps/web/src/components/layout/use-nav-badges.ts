'use client';

import { CHAT_SIDE, PERMISSION } from '@xeprime/types';
import { NAV_BADGE, type NavBadgeKey } from '@/constants/nav';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import {
  useHandoverWorkCount,
  useRequestWorkCount,
} from '@/features/dashboard/hooks/use-nav-work-counts';
import { useVehicleNeedsActionCount } from '@/features/vehicles/hooks/use-vehicle-needs-action-count';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';

export type NavBadgeCounts = Readonly<Record<NavBadgeKey, number>>;

export interface NavBadges {
  counts: NavBadgeCounts;
  /** Huy hiệu có việc đã TRỄ / sắp trễ — vẽ đỏ thay vì cam. Vắng = không khẩn. */
  urgent: Readonly<Partial<Record<NavBadgeKey, boolean>>>;
}

/**
 * Con số trên các mục menu — CHỈ những thứ đang chờ người dùng xử lý.
 *
 * Bốn nguồn, bốn lý do:
 *  - yêu cầu đặt xe chờ duyệt (`useRequestWorkCount`): khách đang đợi câu trả lời, để lâu là mất
 *    đơn — khẩn khi có yêu cầu sắp hết hạn trả lời;
 *  - lượt giao/trả xe ĐẾN HẠN (`useHandoverWorkCount`, 04/11/2026): hẹn tới hết hôm nay hoặc đã
 *    quá giờ — khẩn khi có lượt quá giờ. Không đếm mọi đơn đang thuê;
 *  - xe có việc chặn (03/11/2026): giấy tờ quá hạn, quá hạn bảo dưỡng, bị trả về khi đăng chợ,
 *    thiếu KM trả — CÙNG phép tính với chip đỏ trên thẻ xe (`useVehicleNeedsActionCount`);
 *  - tin nhắn chưa đọc: cùng bản chất, và dùng lại đúng query mà chuông ở thanh trên đã gọi
 *    (`useChatUnreadCount`) nên không phát sinh thêm request nào.
 *
 * Không có huy hiệu cho "số xe", "số khách", "số chi nhánh": đó là thống kê, và thống kê nhét
 * lên menu thì mọi mục đều sáng, không mục nào còn báo được điều gì.
 *
 * Nhân sự nền tảng không có các khái niệm này — query tắt hẳn thay vì gọi rồi nuốt 403.
 */
export function useNavBadges(): NavBadges {
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();

  const isShopScope = Boolean(user) && !user?.platformRole;
  // Huy hiệu chat đọc từ `useBadges` — không phát sinh request nào, và cũng không cần gác quyền:
  // backend suy phạm vi từ membership, người không thuộc gian hàng nào luôn nhận 0.
  const chatUnread = useChatUnreadCount(CHAT_SIDE.SHOP);
  const requests = useRequestWorkCount(isShopScope && has(PERMISSION.BOOKING_REQUEST_VIEW));
  const handovers = useHandoverWorkCount(isShopScope && has(PERMISSION.BOOKING_VIEW));
  const vehiclesNeedsAction = useVehicleNeedsActionCount(
    isShopScope && has(PERMISSION.VEHICLE_VIEW),
  );

  return {
    counts: {
      [NAV_BADGE.CHAT_UNREAD]: isShopScope ? chatUnread : 0,
      // "Đơn thuê xe" gộp (05/11/2026; tuyến hoa hồng từ 06/11): việc của cùng một ca trực ở cùng
      // một mục, ở cả hai tuyến.
      [NAV_BADGE.RENTALS_WORK]: requests.count + handovers.count,
      [NAV_BADGE.VEHICLES_NEEDS_ACTION]: vehiclesNeedsAction,
    },
    urgent: {
      [NAV_BADGE.RENTALS_WORK]: requests.urgent || handovers.urgent,
    },
  };
}
