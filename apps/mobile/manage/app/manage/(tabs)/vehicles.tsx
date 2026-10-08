import { OwnerLiteVehiclesScreen } from '@/features/account/OwnerLiteHomeScreen';
import { PartnerTrackView } from '@/features/shell/PartnerTrackView';
import { VehicleListScreen } from '@/features/vehicles/VehicleListScreen';

/** Đội xe — gian hàng tuyến gói dùng danh sách đầy đủ; chủ xe tuyến hoa hồng dùng bản Owner Lite. */
export default function ManageVehiclesRoute() {
  return (
    <PartnerTrackView
      packageView={<VehicleListScreen />}
      commissionView={<OwnerLiteVehiclesScreen />}
    />
  );
}
