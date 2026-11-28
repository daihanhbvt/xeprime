import { PERMISSION } from '@xeprime/types';
import { usePermissions } from '@/features/auth/hooks/use-permissions';

/**
 * Có hiện lối LẬP ĐƠN TAY (ô "Tạo đơn" trên lịch, nút "Tạo đơn" ở danh sách đơn) hay không — bản
 * native của web `useCanCreateBooking`.
 *
 * Chỉ còn MỘT trục: QUYỀN `bookings.create`. Lập đơn tay mở cho mọi chủ xe, cả hai tuyến (ADR 0110,
 * ghi đè quyết định 26/10/2026) — đơn tự lập nằm ngoài sàn và mang nguồn chủ xe chọn. Chặn thật là
 * `@RequirePermissions` ở `POST /bookings`; đây chỉ là ẩn nút.
 */
export function useCanCreateBooking(): boolean {
  const { has } = usePermissions();
  return has(PERMISSION.BOOKING_CREATE);
}
