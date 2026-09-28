import { useLocalSearchParams } from 'expo-router';
import { HandoverPhotosScreen } from '@/features/handovers/HandoverPhotosScreen';

export default function HandoverPhotosRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <HandoverPhotosScreen bookingId={id} />;
}
