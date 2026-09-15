import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { TaxScreen } from '@/features/account/TaxScreen';

/**
 * Thông tin khai thuế — bản compact của hồ sơ người bán (`/seller-profile`, tenant-scoped).
 *
 * `OwnerGate` đứng NGOÀI: người không phải chủ gian hàng không render `TaxScreen`, tức không gọi
 * `GET /seller-profile` để rồi nhận 403. Đối xứng với `app/(public)/account/tax/page.tsx` bên web.
 */
export default function AccountTaxRoute() {
  return (
    <RequireSession>
      <OwnerGate>
        <TaxScreen />
      </OwnerGate>
    </RequireSession>
  );
}
