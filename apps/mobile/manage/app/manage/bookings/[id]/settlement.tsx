import { useLocalSearchParams } from 'expo-router';
import { SettlementScreen } from '@/features/settlement/SettlementScreen';

export default function SettlementRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SettlementScreen bookingId={id} />;
}
