import { useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { VehicleBookingTermsScreen } from '@/features/vehicle-manage/VehicleBookingTermsScreen';
import { RENTAL_TERMS_ANCHOR } from '@/navigation/vehicle-manage-section';

/** "Nhận chuyến & thủ tục" (có tài xế) của màn sửa xe — web `BookingTermsSection`. */
export default function ManageVehicleEditWithDriverOptimizationRoute() {
  const { id, anchor } = useLocalSearchParams<{ id: string; anchor?: string }>();
  return (
    <VehicleBookingTermsScreen
      vehicleId={id}
      serviceType={SERVICE_TYPE.WITH_DRIVER}
      scrollToTerms={anchor === RENTAL_TERMS_ANCHOR}
      workspace="manage"
    />
  );
}
