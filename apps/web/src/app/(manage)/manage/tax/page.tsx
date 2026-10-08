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
 * ALIAS CHUYỂN TIẾP (07/10/2026) — "Thông tin khai thuế" là một section của trang hồ sơ ở cả hai
 * tuyến, cùng một component: "Hồ sơ chủ xe" của tuyến hoa hồng, trang Cửa hàng của tuyến gói.
 * Phần còn lại của trang cũ — thuế ĐÃ khấu trừ theo kỳ — là chuyện tiền, nên nó ở trang "Số dư &
 * rút tiền". Không còn mục menu nào trỏ tới đây.
 *
 * Lối chuyển CHÍNH là `partnerPageRedirect` (khung trang + đích sau đăng nhập — một luật, một lần
 * chuyển). Thân trang này chỉ là lưới an toàn nếu khung không chặn trước: đích phụ thuộc tuyến, đọc
 * từ `/auth/me`, nên chuyển ở client.
 */
export default function TaxRedirectPage() {
  return (
    <PartnerTrackView
      packageView={<ClientRedirect href={shopSectionPath(SHOP_SECTION.TAX)} />}
      commissionView={<ClientRedirect href={accountSectionPath(ACCOUNT_SECTION.TAX)} />}
    />
  );
}
