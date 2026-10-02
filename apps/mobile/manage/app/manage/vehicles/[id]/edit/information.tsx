import { useLocalSearchParams } from 'expo-router';
import { VehicleEditFormScreen } from '@/features/vehicles/VehicleEditFormScreen';

export default function ManageVehicleEditInformationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleEditFormScreen vehicleId={id} />;
}
