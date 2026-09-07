import { useLocalSearchParams } from 'expo-router';
import { VehicleDocumentsScreen } from '@/features/vehicle-documents/VehicleDocumentsScreen';

export default function ManageVehicleDocumentsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleDocumentsScreen vehicleId={id} />;
}
