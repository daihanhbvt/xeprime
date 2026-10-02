import { RequireSession } from '@/features/auth/RequireSession';
import { QuickVehicleWizardScreen } from '@/features/list-vehicle/QuickVehicleWizardScreen';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';

/**
 * Wizard đăng xe nhanh trong XePrime Partner — đích của "Đăng nhanh xe tự lái" ở đội xe.
 *
 * Web mở CÙNG wizard này từ danh sách xe của gian hàng (`?from=manage`). App này chỉ phục vụ
 * gian hàng nên nguồn luôn là `manage`: thoát/lưu xong đều về đội xe, không về khu khách. Các
 * cửa khác của `/list-your-vehicle` (landing chủ xe) vẫn ở app XePrime.
 */
export default function ManageQuickVehicleRegisterRoute() {
  return (
    <RequireSession>
      <QuickVehicleWizardScreen source={VEHICLE_REGISTRATION_SOURCE.MANAGE} />
    </RequireSession>
  );
}
