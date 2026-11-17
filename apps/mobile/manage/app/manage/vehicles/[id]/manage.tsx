import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { OwnerVehicleEditHubScreen } from '@/features/vehicle-manage/OwnerVehicleEditHubScreen';

/**
 * Gốc màn SỬA XE của chủ xe tuyến hoa hồng — MENU ba nhóm như web `VehicleEditWorkspace`
 * (`isManage === false`). Web mở thẳng mục "Thông tin chung" vì menu trái luôn hiện; trên điện
 * thoại menu CHÍNH LÀ màn gốc.
 *
 * File `manage.tsx` ĐỨNG CẠNH thư mục `manage/`, KHÔNG phải `manage/index.tsx`: trình sinh kiểu
 * route của expo-router đặt tên route đó là `/manage/index` thay vì `/manage`, và mọi lời gọi
 * `ROUTES.account.vehicleManage()` sẽ đỏ. Cùng lý do với `[id].tsx` cạnh `[id]/`.
 */
export default function ManageOwnerLiteVehicleEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <OwnerVehicleEditHubScreen vehicleId={id} />
    </OwnerGate>
  );
}
