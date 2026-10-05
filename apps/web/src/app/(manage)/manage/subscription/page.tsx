'use client';

import { SHOP_SECTION, shopSectionPath } from '@/constants/routes';
import { ClientRedirect } from '@/features/partner/components/ClientRedirect';
import { PartnerTrackView } from '@/features/partner/components/PartnerTrackView';
import { OwnerSubscriptionView } from '@/features/subscription/components/OwnerSubscriptionView';

/**
 * Gói dịch vụ — MỘT URL hai tuyến (ADR 0051 điều 3). Tuyến gói quản lý gói trong section "Gói & hạn
 * mức" của trang Cửa hàng (16/09/2026), nên URL này chuyển tới đó; tuyến hoa hồng thấy phễu nâng cấp.
 */
export default function SubscriptionPage() {
  return (
    <PartnerTrackView
      packageView={<ClientRedirect href={shopSectionPath(SHOP_SECTION.PLAN)} />}
      commissionView={<OwnerSubscriptionView />}
    />
  );
}
