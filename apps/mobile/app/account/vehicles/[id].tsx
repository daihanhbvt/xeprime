import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleDetailScreen } from '@/features/vehicles/VehicleDetailScreen';
import { ROUTES } from '@/navigation/routes';

/**
 * Hồ sơ 360 của một xe nhìn từ khu tài khoản — dùng THẲNG màn chi tiết dùng chung.
 *
 * Web cũng vậy (`/account/vehicles/[id]` chỉ là vỏ quanh `VehicleDetailContent`): không có màn
 * chi tiết xe thứ hai, query/quyền/trạng thái/hành động đều nằm trong màn dùng chung.
 */
export default function AccountVehicleDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        {/*
          `backTo` PHẢI trỏ về danh sách xe của khu TÀI KHOẢN. Bỏ trống thì màn dùng chung lấy
          mặc định `/manage/vehicles`, và xoá một chiếc xe từ hồ sơ cá nhân sẽ ném người dùng
          sang cổng quản lý — đổi luôn cả thanh tab dưới chân màn hình. Web truyền đúng cặp này
          (`back` + `onDeleted`) vào `VehicleDetailContent`.
        */}
        <VehicleDetailScreen
          vehicleId={id}
          backTo={ROUTES.account.vehicles()}
          customerScope
        />
      </OwnerGate>
    </RequireSession>
  );
}
