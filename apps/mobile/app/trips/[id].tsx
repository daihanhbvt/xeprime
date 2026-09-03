import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { TripDetailScreen } from '@/features/trips/TripDetailScreen';

/**
 * Chi tiết một chuyến. `id` nhận CẢ id yêu cầu lẫn id đơn — `GET /trips/:id` phục vụ hai giai
 * đoạn của cùng một chuyến, nên không có route thứ hai và không phải đoán loại id.
 */
export default function TripDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireSession>
      <TripDetailScreen tripId={id} />
    </RequireSession>
  );
}
