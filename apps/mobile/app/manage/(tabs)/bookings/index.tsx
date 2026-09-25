import { useLocalSearchParams } from 'expo-router';
import { BookingListScreen } from '@/features/bookings/BookingListScreen';

export default function ManageBookingsRoute() {
  // Lối đi từ hồ sơ xe kèm `?vehicleId=` — cùng tham số web dùng trên URL.
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  return <BookingListScreen {...(vehicleId ? { vehicleId } : {})} />;
}
