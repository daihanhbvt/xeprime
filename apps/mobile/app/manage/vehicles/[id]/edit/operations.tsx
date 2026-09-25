import { useLocalSearchParams } from 'expo-router';
import { VehicleOperationsScreen } from '@/features/vehicle-manage/VehicleOperationsScreen';

export default function ManageVehicleOperationsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleOperationsScreen vehicleId={id} />;
}
