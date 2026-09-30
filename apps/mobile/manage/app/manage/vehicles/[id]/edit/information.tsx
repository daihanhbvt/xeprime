import { useLocalSearchParams } from 'expo-router';
import { VehicleEditFormScreen } from '@/features/vehicles/VehicleEditFormScreen';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';

export default function ManageVehicleEditInformationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleEditFormScreen vehicleId={id} tab={VEHICLE_EDIT_TAB.INFORMATION} />;
}
