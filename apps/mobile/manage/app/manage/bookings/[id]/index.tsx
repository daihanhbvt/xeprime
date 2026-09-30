import { useLocalSearchParams } from 'expo-router';
import { BookingDetailScreen } from '@/features/bookings/BookingDetailScreen';

export default function ManageBookingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookingDetailScreen bookingId={id} />;
}
