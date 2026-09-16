'use client';

import { useTranslations } from 'next-intl';
import { accountTrackLabelKey, resolveAccountTrack, type AccountTrackInput } from '@xeprime/types';

import { useDomainLabel } from '@/i18n/use-domain-label';

/** Đúng phần `/auth/me` mà nhãn cần — nhận shape sẵn có để nơi gọi không phải nhào nặn. */
interface IdentityInput {
  tenant?: AccountTrackInput | null;
  platformRole?: string | null;
}

/**
 * "Gọi người đang đăng nhập là gì" — MỘT câu trả lời cho mọi thẻ tài khoản của web.
 *
 * ## Vì sao không phải `domainLabel('tenantRole', roleKey)`
 *
 * Chủ xe cá nhân và chủ gian hàng CÙNG vai `shop_owner` (ADR 0014); thứ tách họ là TUYẾN. Bảng
 * `tenantRole` dịch cả hai thành "Chủ gian hàng" — đúng khi gọi tên một vai RBAC trong danh sách
 * nhân sự, sai khi dùng làm nhãn danh tính. Lỗi nhìn thấy được trên `/account` ngày 16/09/2026:
 * đầu trang nói "Chủ xe cá nhân · Hoa hồng 10%", thẻ người dùng ngay dưới menu nói "Chủ gian
 * hàng" — cùng một con người, hai câu trả lời.
 *
 * Phép suy nằm ở `accountTrackLabelKey` (`@xeprime/types`, dùng chung với app native), hook này
 * chỉ tra bảng dịch và quyết định thứ tự rơi về.
 *
 * ## Thứ tự rơi về, và vì sao vai GIAN HÀNG thắng
 *
 *   1. tuyến/vai trong gian hàng — thứ quyết định người này làm gì hằng ngày;
 *   2. vai NỀN TẢNG — chỉ khi họ không thuộc gian hàng nào;
 *   3. "Tài khoản XePrime" — không bao giờ để trống: một dòng rỗng dưới tên đọc ra như dữ liệu
 *      bị thiếu.
 *
 * Trước đợt gom này, `VehicleManageSidebar` bỏ hẳn bậc 2 — nên một nhân sự nền tảng đứng ở hồ sơ
 * xe nhìn thấy "Tài khoản XePrime" trong khi hai sidebar còn lại gọi đúng vai của họ.
 */
export function useAccountIdentityLabel(): (user: IdentityInput | null | undefined) => string {
  const tTrack = useTranslations('Account.trackBadge');
  const tAccount = useTranslations('Account');
  const domainLabel = useDomainLabel();

  return (user) => {
    const { track, roleKey } = resolveAccountTrack(user?.tenant ?? null);
    const key = accountTrackLabelKey(track, roleKey);
    if (key) return tTrack(key);
    if (user?.platformRole) return domainLabel('platformRole', user.platformRole, user.platformRole);
    return tAccount('profile.accountLabel');
  };
}
