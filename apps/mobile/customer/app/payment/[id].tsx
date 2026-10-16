import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { TripPaymentScreen } from '@/features/trips/TripPaymentScreen';

/**
 * Màn thanh toán tiền giữ chỗ — cùng địa chỉ `/payment/:tripId` với web. `id` là id yêu cầu thuê
 * (chuyến đã được nhận, đang chờ tiền).
 */
export default function TripPaymentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireSession>
      <TripPaymentScreen tripId={id} />
    </RequireSession>
  );
}
