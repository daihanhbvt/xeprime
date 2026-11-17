import { Redirect, useLocalSearchParams } from 'expo-router';
import { BOOKING_HISTORY_TAB } from '@xeprime/types';
import { RentalsScreen } from '@/features/bookings/RentalsScreen';
import { stageFromLegacyRequestStatus } from '@/features/bookings/rental-stages';
import { ROUTES } from '@/navigation/routes';

/**
 * Hộp thư "Yêu cầu đặt xe" cũ — đã GỘP vào "Đơn thuê xe" (05/11/2026, sổ cái §3.2b). Link cũ chuyển
 * tiếp như web: `?status=awaiting_hold` → nhóm "Chờ khách thanh toán", `closed` → "Đơn đã kết thúc"
 * › "Không thành đơn", còn lại → "Cần xử lý". `?request=<id>` vẫn mở sẵn một yêu cầu.
 */
export default function ManageRequestsRoute() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const stage = stageFromLegacyRequestStatus(status);
  if (stage === null) {
    return <Redirect href={ROUTES.manage.bookingsEnded(BOOKING_HISTORY_TAB.NOT_CONVERTED)} />;
  }
  return <RentalsScreen initialStage={stage} />;
}
