import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { QuickVehicleWizardScreen } from '@/features/list-vehicle/QuickVehicleWizardScreen';
import {
  VEHICLE_REGISTRATION_SOURCE,
  isVehicleRegistrationSource,
} from '@/navigation/vehicle-registration-source';

/**
 * Wizard đăng xe nhanh — cửa của TUYẾN HOA HỒNG (ADR 0028).
 *
 * Nằm ở khu KHÁCH, KHÔNG sau `ScopeGuard`: chủ xe cá nhân đăng xe mà không cần gian hàng, và
 * bước 1 của wizard chính là chỗ tạo hồ sơ chủ xe.
 *
 * `from` chỉ nhận một trong ba mã đã biết; giá trị lạ rơi về `marketplace` thay vì được tin.
 */
export default function ListYourVehicleRegisterRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const source = isVehicleRegistrationSource(from)
    ? from
    : VEHICLE_REGISTRATION_SOURCE.MARKETPLACE;

  return (
    <RequireSession>
      <QuickVehicleWizardScreen source={source} />
    </RequireSession>
  );
}
