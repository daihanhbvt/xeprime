import { useLocalSearchParams } from 'expo-router';
import { PartnerTrackView } from '@/features/shell/PartnerTrackView';
import { VehicleFinanceScreen } from '@/features/vehicles/VehicleFinanceScreen';

/**
 * Tài chính của MỘT xe (web tab Tài chính của hồ sơ xe, ADR 0110 · 0111) - màn riêng mở từ chi tiết
 * xe. "Nghĩa vụ nguồn xe" chỉ ở tuyến gói, như thẻ "Nguồn xe & tài chính" của chi tiết xe.
 */
export default function ManageVehicleFinanceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PartnerTrackView
      packageView={<VehicleFinanceScreen vehicleId={id} showCapital />}
      commissionView={<VehicleFinanceScreen vehicleId={id} showCapital={false} />}
    />
  );
}
