import { useLocalSearchParams } from 'expo-router';
import { VehicleOptimizationScreen } from '@/features/vehicle-manage/VehicleOptimizationScreen';

export default function ManageVehicleOptimizationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleOptimizationScreen vehicleId={id} />;
}
