import { useLocalSearchParams } from 'expo-router';
import { VehicleEditHubScreen } from '@/features/vehicles/VehicleEditHubScreen';

export default function ManageVehicleEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleEditHubScreen vehicleId={id} />;
}
