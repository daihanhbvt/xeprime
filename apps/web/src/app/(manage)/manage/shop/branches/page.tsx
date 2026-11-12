import { redirect } from 'next/navigation';

import { SHOP_SECTION, shopSectionPath } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (02/11/2026) — "Chi nhánh" rời menu ở design menu ngang và về làm một section của
 * "Thông tin cửa hàng" (`docs/design/09_PARTNER_REDESIGN.md` §2). Bookmark và link cũ vẫn tới đúng chỗ.
 *
 * Phiên hỗ trợ gian hàng ở site quản trị vẫn có trang riêng (`tenant-support/[contextId]/shop/branches`).
 */
export default function ManageBranchesRedirectPage(): never {
  redirect(shopSectionPath(SHOP_SECTION.BRANCHES));
}
