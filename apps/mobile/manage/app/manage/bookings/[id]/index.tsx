import { useLocalSearchParams } from 'expo-router';
import { BookingDetailScreen } from '@/features/bookings/BookingDetailScreen';

export default function ManageBookingDetailRoute() {
  const { id, action, code, status, createdAt } = useLocalSearchParams<{
    id: string;
    action?: string;
    code?: string;
    status?: string;
    createdAt?: string;
  }>();
  return (
    <BookingDetailScreen
      bookingId={id}
      openNoShow={action === 'no_show'}
      preview={code ? { code, ...(status ? { status } : {}), ...(createdAt ? { createdAt } : {}) } : undefined}
    />
  );
}
