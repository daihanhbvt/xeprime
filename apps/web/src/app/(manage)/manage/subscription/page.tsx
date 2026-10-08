'use client';

import {
  ACCOUNT_SECTION,
  SHOP_SECTION,
  accountSectionPath,
  shopSectionPath,
} from '@/constants/routes';
import { ClientRedirect } from '@/features/partner/components/ClientRedirect';
import { PartnerTrackView } from '@/features/partner/components/PartnerTrackView';

/**
 * ALIAS CHUYỂN TIẾP — gói dịch vụ là một SECTION của trang hồ sơ ở cả hai tuyến (ADR 0051 điều 3):
 * "Gói & hạn mức" của trang Cửa hàng (tuyến gói, 16/09/2026) và "Gói dịch vụ" của "Hồ sơ chủ xe"
 * (tuyến hoa hồng, 07/10/2026 — phễu nâng cấp, ADR 0028 điều 1). Không còn mục menu nào trỏ tới đây.
 *
 * Lối chuyển CHÍNH là `partnerPageRedirect` (khung trang + đích sau đăng nhập). Thân trang này chỉ là
 * lưới an toàn nếu khung không chặn trước.
 */
export default function SubscriptionRedirectPage() {
  return (
    <PartnerTrackView
      packageView={<ClientRedirect href={shopSectionPath(SHOP_SECTION.PLAN)} />}
      commissionView={<ClientRedirect href={accountSectionPath(ACCOUNT_SECTION.PLAN)} />}
    />
  );
}
