import { RequireSession } from '@/features/auth/RequireSession';
import { AccountVehiclesScreen } from '@/features/account/AccountVehiclesScreen';
import { OwnerGate } from '@/features/account/components/OwnerGate';

/**
 * Danh sách xe của chủ xe — cùng feature `vehicles` với cổng quản lý, vỏ của khu tài khoản.
 *
 * `OwnerGate` đứng NGOÀI: người không phải chủ gian hàng không render màn, tức không gọi
 * `GET /vehicles` để rồi nhận 403. Đối xứng với `app/(public)/account/vehicles/page.tsx` bên web.
 */
export default function AccountVehiclesRoute() {
  return (
    <RequireSession>
      <OwnerGate>
        <AccountVehiclesScreen />
      </OwnerGate>
    </RequireSession>
  );
}
