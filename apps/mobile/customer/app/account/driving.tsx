import { RequireSession } from '@/features/auth/RequireSession';
import { DriverCenterScreen } from '@/features/driving/DriverCenterScreen';

/** "Trung tâm Tài xế" — chuyến tôi lái + chủ xe đối tác của tài khoản khách (ADR 0063). */
export default function AccountDrivingRoute() {
  return (
    <RequireSession>
      <DriverCenterScreen />
    </RequireSession>
  );
}
