import { PERMISSION } from '@xeprime/types';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/shell/partner-track';

/**
 * Người này có mở được HỒ SƠ KHÁCH (sổ khách của gian hàng) từ một yêu cầu không — bản native của
 * `CUSTOMER_VIEW && isManageWorkspace` bên web (`BookingRequestsView`, PR #158).
 *
 * Sổ khách là năng lực của GÓI: API `customers` gác bằng `@SubscriptionTrackOnly` (ADR 0056), nên
 * một nhân viên gian hàng tuyến hoa hồng có `customers.view` vẫn nhận 403. Hỏi cả quyền LẪN tuyến
 * để giao diện không mời người dùng vào một cánh cửa đã khoá.
 */
export function useCustomerProfileAccess(): boolean {
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();
  return has(PERMISSION.CUSTOMER_VIEW) && resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE;
}
