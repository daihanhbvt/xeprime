import { useLocalSearchParams } from 'expo-router';
import { VehiclePricingScreen } from '@/features/vehicle-pricing/VehiclePricingScreen';

export default function ManageVehiclePricingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehiclePricingScreen vehicleId={id} />;
}
