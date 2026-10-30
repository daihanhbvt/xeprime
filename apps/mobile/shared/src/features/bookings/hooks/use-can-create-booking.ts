import { PERMISSION } from '@xeprime/types';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/shell/partner-track';

/**
 * Có hiện lối LẬP ĐƠN TAY (ô "Tạo đơn" trên lịch, nút "Tạo đơn" ở danh sách đơn) hay không — bản
 * native của web `useCanCreateBooking`.
 *
 * Hai trục nối tiếp (ADR 0027 điều 2): QUYỀN `bookings.create`, rồi TUYẾN — lập đơn tay chỉ dành cho
 * gian hàng tuyến gói (26/10/2026). Chủ xe cá nhân giữ lịch cho chuyến ngoài chợ bằng khoá lịch.
 * Chặn thật là `@SubscriptionTrackOnly()` ở `POST /bookings`; đây chỉ là ẩn nút.
 */
export function useCanCreateBooking(): boolean {
  const { has } = usePermissions();
  const { data: user } = useCurrentUser();
  return has(PERMISSION.BOOKING_CREATE) && resolvePartnerTrack(user) !== PARTNER_TRACK.COMMISSION;
}
