import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleInformationScreen } from '@/features/vehicle-manage/VehicleInformationScreen';

/**
 * Mục "Thông tin xe" — màn RIÊNG của không gian quản lý xe, không phải một tab của form sửa xe.
 *
 * Trước đợt này route trỏ vào `VehicleEditFormScreen(tab=INFORMATION)`: 24 trường, kèm dải 6 tab
 * của cổng quản lý, và nút lui dẫn về `/manage/vehicles/:id/edit` — nơi chủ xe tuyến hoa hồng
 * không vào được. Nay đúng 15 trường như web, đúng vỏ khu tài khoản.
 */
export default function AccountVehicleManageInformationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <VehicleInformationScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
