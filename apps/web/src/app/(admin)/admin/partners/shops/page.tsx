import { PLATFORM_PARTNER_KIND } from '@xeprime/types';
import { AdminPartnerListPage } from '@/features/admin-tenants/components/AdminPartnerListPage';

/** "Gian hàng gói" — tuyến gói, gồm cả gian hàng đang chờ kích hoạt gói (`PLATFORM_PARTNER_KIND`). */
export default function AdminPartnerShopsPage() {
  return <AdminPartnerListPage partnerKind={PLATFORM_PARTNER_KIND.PACKAGE_SHOP} />;
}
