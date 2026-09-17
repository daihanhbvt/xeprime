import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleManageHubScreen } from '@/features/vehicle-manage/VehicleManageHubScreen';

/**
 * Gốc của không gian "Quản lý xe" — MỤC LỤC 13 mục.
 *
 * Web tự chuyển tới mục đầu tiên vì menu trái của nó luôn hiện; trên điện thoại mục lục CHÍNH LÀ
 * menu, nên gốc phải có nội dung.
 *
 * File `manage.tsx` ĐỨNG CẠNH thư mục `manage/`, KHÔNG phải `manage/index.tsx`: trình sinh kiểu
 * route của expo-router đặt tên route đó là `/manage/index` thay vì `/manage`, và mọi lời gọi
 * `ROUTES.account.vehicleManage()` sẽ đỏ. Cùng lý do với `[id].tsx` cạnh `[id]/`.
 */
export default function AccountVehicleManageRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <VehicleManageHubScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
