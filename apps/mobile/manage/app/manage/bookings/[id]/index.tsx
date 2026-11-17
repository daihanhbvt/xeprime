import { useLocalSearchParams } from 'expo-router';
import { BookingDetailScreen } from '@/features/bookings/BookingDetailScreen';

export default function ManageBookingDetailRoute() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  return <BookingDetailScreen bookingId={id} openNoShow={action === 'no_show'} />;
}
