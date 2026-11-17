import { useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { VehiclePricingScreen } from '@/features/vehicle-pricing/VehiclePricingScreen';
import { RENTAL_TERMS_ANCHOR } from '@/navigation/vehicle-manage-section';

/**
 * Mục "Chính sách thuê" của màn sửa xe — web `PolicyPane` (ledger §3.6 E13-E17): nguồn chính
 * sách (theo gian hàng / tuỳ chỉnh riêng), các khối chính sách, thời gian chết giữa hai chuyến,
 * điều kiện thuê của từng dịch vụ đang bật.
 */
export default function ManageVehicleEditPolicyRoute() {
  const { id, anchor, service } = useLocalSearchParams<{
    id: string;
    anchor?: string;
    service?: string;
  }>();
  // Link cũ `*-terms` (web `scrollTo`): cuộn tới khối điều khoản của dịch vụ đó.
  const scrollToTerms =
    anchor === RENTAL_TERMS_ANCHOR &&
    (service === SERVICE_TYPE.SELF_DRIVE || service === SERVICE_TYPE.WITH_DRIVER)
      ? service
      : undefined;
  return (
    <VehiclePricingScreen
      vehicleId={id}
      pane="policy"
      {...(scrollToTerms ? { scrollToTerms } : {})}
    />
  );
}
