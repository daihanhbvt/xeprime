'use client';

import { PERMISSION } from '@xeprime/types';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Có hiện lối LẬP ĐƠN TAY (ô "Tạo đơn" trên lịch, nút "Tạo đơn" ở danh sách đơn) hay không.
 *
 * Hai trục nối tiếp (ADR 0027 điều 2): QUYỀN `bookings.create`, rồi TUYẾN — lập đơn tay chỉ dành cho
 * gian hàng tuyến gói (26/10/2026). Chủ xe cá nhân giữ lịch cho chuyến ngoài chợ bằng khoá lịch.
 * Chặn thật là `@SubscriptionTrackOnly()` ở `POST /bookings`; đây chỉ là ẩn nút.
 *
 * Phiên hỗ trợ (ADR 0050) không mang gian hàng trên người đăng nhập — tuyến ra `none`, và quyết định
 * thuộc về bộ quyền của phiên như mọi nút khác.
 */
export function useCanCreateBooking(): boolean {
  const { has } = usePermissions();
  const { data: user } = useCurrentUser();
  return has(PERMISSION.BOOKING_CREATE) && resolvePartnerTrack(user) !== PARTNER_TRACK.COMMISSION;
}
