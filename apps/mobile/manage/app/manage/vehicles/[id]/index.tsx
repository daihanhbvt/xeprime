import { useLocalSearchParams } from 'expo-router';
import { VehicleDetailScreen } from '@/features/vehicles/VehicleDetailScreen';

export default function ManageVehicleDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleDetailScreen vehicleId={id} />;
}
