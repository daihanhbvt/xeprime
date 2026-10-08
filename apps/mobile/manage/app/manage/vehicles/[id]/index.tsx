import { useLocalSearchParams } from 'expo-router';
import { PartnerTrackView } from '@/features/shell/PartnerTrackView';
import { VehicleDetailScreen } from '@/features/vehicles/VehicleDetailScreen';
import { ROUTES } from '@/navigation/routes';

/**
 * Hồ sơ 360 của một xe — MỘT đường dẫn cho hai tuyến (web `/vehicles/<id>` của site partner). Tuyến
 * hoa hồng mở ở chế độ Owner Lite (`customerScope`): lối sửa đi vào không gian
 * `/manage/vehicles/<id>/manage/...` thay cho hub sửa đầy đủ của tuyến gói.
 */
export default function ManageVehicleDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PartnerTrackView
      packageView={<VehicleDetailScreen vehicleId={id} />}
      commissionView={
        <VehicleDetailScreen vehicleId={id} backTo={ROUTES.manage.vehicles()} customerScope />
      }
    />
  );
}
