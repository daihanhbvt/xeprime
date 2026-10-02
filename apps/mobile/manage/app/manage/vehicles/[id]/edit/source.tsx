import { useLocalSearchParams } from 'expo-router';
import { VehicleSourceScreen } from '@/features/vehicles/VehicleSourceScreen';

export default function ManageVehicleSourceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleSourceScreen vehicleId={id} />;
}
