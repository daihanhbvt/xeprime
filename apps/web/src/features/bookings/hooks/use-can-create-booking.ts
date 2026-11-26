'use client';

import { PERMISSION } from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Có hiện lối LẬP ĐƠN TAY (ô "Tạo đơn" trên lịch, nút "Tạo đơn" ở danh sách đơn) hay không.
 *
 * Chỉ còn MỘT trục: QUYỀN `bookings.create`. Lập đơn tay mở cho mọi chủ xe, cả hai tuyến (ADR 0110,
 * ghi đè quyết định 26/10/2026) — đơn tự lập nằm ngoài sàn và mang nguồn chủ xe chọn. Chặn thật là
 * `@RequirePermissions` ở `POST /bookings`; đây chỉ là ẩn nút.
 *
 * Phiên hỗ trợ (ADR 0050): quyết định thuộc về bộ quyền của phiên như mọi nút khác.
 */
export function useCanCreateBooking(): boolean {
  const { has } = usePermissions();
  return has(PERMISSION.BOOKING_CREATE);
}
