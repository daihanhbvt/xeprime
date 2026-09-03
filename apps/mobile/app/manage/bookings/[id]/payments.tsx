import { useLocalSearchParams } from 'expo-router';
import { PaymentsScreen } from '@/features/settlement/PaymentsScreen';

export default function PaymentsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PaymentsScreen bookingId={id} />;
}
