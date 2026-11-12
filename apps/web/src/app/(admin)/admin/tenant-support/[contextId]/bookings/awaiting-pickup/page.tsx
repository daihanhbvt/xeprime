import { redirect } from 'next/navigation';
import { BOOKING_LIST_PRESET } from '@xeprime/types';
import { BOOKINGS_GROUP_PARAM, adminTenantSupportPath } from '@/constants/routes';

/**
 * "Chờ giao xe" trong phiên hỗ trợ (ADR 0050) — từ 02/11/2026 là ngăn `?preset=awaiting_pickup` của
 * chính màn đơn thuê, cùng như site partner. Route cũ chỉ chuyển tiếp, giữ nguyên phiên.
 */
export default async function Page({ params }: { params: Promise<{ contextId: string }> }) {
  const { contextId } = await params;
  redirect(
    `${adminTenantSupportPath.root(contextId)}/bookings?${BOOKINGS_GROUP_PARAM}=${BOOKING_LIST_PRESET.AWAITING_PICKUP}`,
  );
}
