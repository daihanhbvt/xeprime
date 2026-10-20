import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { DrivingTripDetailScreen } from '@/features/driving/DrivingTripDetailScreen';

/** Chi tiết một chuyến tôi LÁI (ADR 0063) — `id` là id ĐƠN THUÊ, cùng địa chỉ với web. */
export default function DrivingTripDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireSession>
      <DrivingTripDetailScreen bookingId={id ?? ''} />
    </RequireSession>
  );
}
