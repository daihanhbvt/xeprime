import { RequireSession } from '@/features/auth/RequireSession';
import { DriverLinksScreen } from '@/features/driving/DriverLinksScreen';

/** "Nơi tôi làm tài xế" — lời mời + liên kết tài xế của tài khoản khách (ADR 0063). */
export default function AccountDrivingRoute() {
  return (
    <RequireSession>
      <DriverLinksScreen />
    </RequireSession>
  );
}
