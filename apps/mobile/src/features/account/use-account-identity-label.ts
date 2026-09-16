import { useTranslations } from 'use-intl';
import { accountTrackLabelKey, resolveAccountTrack, type AccountTrackInput } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';

/** Đúng phần `/auth/me` mà nhãn cần — nhận shape sẵn có để nơi gọi không phải nhào nặn. */
interface IdentityInput {
  tenant?: AccountTrackInput | null;
  platformRole?: string | null;
}

/**
 * "Gọi người đang đăng nhập là gì" — MỘT câu trả lời cho mọi thẻ tài khoản của app.
 *
 * ## Vì sao không phải `domainLabel('tenantRole', roleKey)`
 *
 * Chủ xe cá nhân và chủ gian hàng CÙNG vai `shop_owner` (ADR 0014); thứ tách họ là TUYẾN. Bảng
 * `tenantRole` dịch cả hai thành "Chủ gian hàng", nên thẻ người dùng từng nói "Chủ gian hàng"
 * ngay dưới một viên nhãn ghi "Chủ xe cá nhân · Hoa hồng 10%" — cùng một con người, hai câu trả
 * lời. Phép suy đúng nằm ở `accountTrackLabelKey` (`@xeprime/types`, dùng chung với web).
 *
 * ## Thứ tự rơi về, và vì sao vai GIAN HÀNG thắng
 *
 *   1. tuyến/vai trong gian hàng — thứ quyết định người này làm gì hằng ngày;
 *   2. vai NỀN TẢNG — chỉ khi họ không thuộc gian hàng nào;
 *   3. "Tài khoản XePrime" — không bao giờ để trống: một dòng rỗng dưới tên đọc ra như dữ liệu
 *      bị thiếu.
 *
 * Trước đợt gom này, drawer khu quản lý đảo ngược hai bậc đầu (nền tảng thắng gian hàng) còn
 * sidebar hồ sơ xe thì bỏ hẳn bậc nền tảng — ba bề mặt, ba câu trả lời cho cùng một người.
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
