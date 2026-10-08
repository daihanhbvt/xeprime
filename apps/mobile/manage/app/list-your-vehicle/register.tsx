import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { QuickVehicleWizardScreen } from '@/features/list-vehicle/QuickVehicleWizardScreen';
import {
  VEHICLE_REGISTRATION_SOURCE,
  isVehicleRegistrationSource,
} from '@/navigation/vehicle-registration-source';

/**
 * Wizard đăng xe nhanh trong XePrime Partner — web `/vehicles/register` của site partner.
 *
 * Từ ADR 0053 nó có BA cửa vào trong app này, và `?from=` nói người dùng tới từ đâu — y như web đọc
 * `from` qua `isVehicleRegistrationSource`:
 *  - `marketplace` — "Đăng xe đầu tiên" ở màn chọn cách cho thuê (tài khoản chưa có gian hàng);
 *  - `account` — "Thêm xe" của Owner Lite (chủ xe tuyến hoa hồng);
 *  - `manage` — "Đăng nhanh xe tự lái" ở đội xe của gian hàng tuyến gói.
 * Nguồn quyết định đích sau khi lưu: Owner Lite về không gian quản lý xe của nó, gian hàng gói về
 * hub sửa xe. Thiếu/lạ ⇒ `manage` như trước.
 *
 * Nằm NGOÀI `manage/` (không sau `ScopeGuard`): tài khoản chưa có gian hàng phải vào được.
 */
export default function ManageQuickVehicleRegisterRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const source = isVehicleRegistrationSource(from) ? from : VEHICLE_REGISTRATION_SOURCE.MANAGE;
  return (
    <RequireSession>
      <QuickVehicleWizardScreen source={source} />
    </RequireSession>
  );
}
