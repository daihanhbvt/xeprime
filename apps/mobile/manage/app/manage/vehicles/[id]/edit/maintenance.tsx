import { useLocalSearchParams } from 'expo-router';
import { VehicleMaintenanceScreen } from '@/features/vehicle-maintenance/VehicleMaintenanceScreen';

export default function ManageVehicleMaintenanceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleMaintenanceScreen vehicleId={id} />;
}
