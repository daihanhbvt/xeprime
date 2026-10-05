import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { BookingDetailPage } from '@/features/bookings/components/BookingDetailPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Chi tiết đơn — CHÍNH `BookingDetailPage` (quyết toán, bàn giao ẩn trong phiên). */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.BOOKING_VIEW}>
      <BookingDetailPage />
    </SupportRoute>
  );
}
