import { RequireSession } from '@/features/auth/RequireSession';
import { DriverLicenceScreen } from '@/features/driver-licence/DriverLicenceScreen';

/** Giấy tờ & Xác minh — bằng lái của tài khoản khách (ADR 0057). */
export default function AccountDocumentsRoute() {
  return (
    <RequireSession>
      <DriverLicenceScreen />
    </RequireSession>
  );
}
