import { STOREFRONT_KIND, storefrontAvatarUrl } from '@xeprime/types';

import { isCommissionOwner } from '@/features/auth/post-auth-destination';
import type { CurrentUser } from '@/hooks/use-current-user';

/**
 * Ảnh của KHU LÀM VIỆC trên vỏ site partner (thẻ chân sidebar, topbar) — CÙNG luật với mặt tiền
 * công khai (`storefrontAvatarUrl`):
 *
 *  - gian hàng: logo, không có thì chữ cái đầu. Trong cổng quản lý, thứ đang được vận hành là cửa
 *    hàng.
 *  - CHỦ xe tuyến hoa hồng: logo nếu hồ sơ còn một tấm (từ thời có gói), không thì ẢNH ĐẠI DIỆN
 *    của chính họ. Vỏ hiện chữ cái trong khi trang công khai hiện ảnh của họ là hai nơi nói hai
 *    điều về cùng một người.
 *
 * Mặt tiền ở đây chọn theo NGƯỜI XEM, không chỉ theo tuyến: thành viên của một gian hàng tuyến hoa
 * hồng không được thấy ảnh chân dung của chính mình đứng làm mặt tiền của chủ.
 *
 * Lên gói / hết gói không cần đồng bộ gì: hàm đọc tuyến từ `/auth/me` ở mỗi lần vẽ.
 */
export function workspaceAvatar(user: CurrentUser): {
  src: string | undefined;
  /** Tròn = ảnh một con người (chủ xe cá nhân); vuông bo góc = danh tính của cửa hàng. */
  shape: 'circle' | 'square';
} {
  const personal = isCommissionOwner(user);
  const kind = personal ? STOREFRONT_KIND.PERSONAL : STOREFRONT_KIND.SHOP;
  return {
    src: storefrontAvatarUrl(user.tenant?.logoUrl, user.avatarUrl, kind) ?? undefined,
    shape: personal ? 'circle' : 'square',
  };
}
