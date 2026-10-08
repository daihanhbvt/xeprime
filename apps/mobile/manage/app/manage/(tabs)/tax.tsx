import { OwnerGate } from '@/features/account/components/OwnerGate';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { TaxScreen } from '@/features/account/TaxScreen';

/**
 * Thông tin khai thuế — bản compact của hồ sơ người bán (`/seller-profile`, tenant-scoped).
 *
 * `OwnerGate` đứng NGOÀI: người không phải chủ gian hàng không render `TaxScreen`, tức không gọi
 * `GET /seller-profile` để rồi nhận 403. Đối xứng với `app/(public)/account/tax/page.tsx` bên web.
 */
export default function ManageOwnerLiteTaxRoute() {
  return (
    <OwnerGate header={<ManageHeader />}>
      <TaxScreen shell="manage" />
    </OwnerGate>
  );
}
