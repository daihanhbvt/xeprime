import { PLATFORM_PARTNER_KIND } from '@xeprime/types';
import { AdminPartnerListPage } from '@/features/admin-tenants/components/AdminPartnerListPage';

/** "Chủ xe cá nhân" — tuyến hoa hồng / Owner Lite (`PLATFORM_PARTNER_KIND`). */
export default function AdminPartnerOwnersPage() {
  return <AdminPartnerListPage partnerKind={PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER} />;
}
