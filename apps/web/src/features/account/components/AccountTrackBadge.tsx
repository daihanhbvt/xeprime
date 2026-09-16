'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import {
  ACCOUNT_TRACK,
  accountTrackLabelKey,
  resolveAccountTrack,
  type AccountTrackInput,
} from '@xeprime/types';

import { cx } from '@/lib/cx';

import styles from './AccountTrackBadge.module.css';

/**
 * "Tài khoản này là ai trên sàn" — một nhãn, dùng lại ở MỌI nơi hỏi câu đó.
 *
 * ## Vì sao nó phải là một component chứ không phải một chuỗi ghép tại chỗ
 *
 * Câu trả lời cần ba dữ kiện (`roleKey`, `billingMode`, và tên gói hoặc % phí dịch vụ) và có
 * NĂM kết quả — trong đó hai kết quả dễ bị gộp nhầm nhất lại là hai kết quả quan trọng nhất:
 *
 *  - quản lý / nhân viên / người xem **không phải chủ**: nhãn của họ nói đúng VAI, vì gọi một
 *    nhân viên là "Chủ gian hàng" ngay trên thẻ tài khoản của chính họ là sai về con người;
 *  - `unconfigured` **không phải một tuyến**: backend đang từ chối mọi đường ghi tiền của tenant
 *    đó (ADR 0038 điều 1), nên in "Hoa hồng 10%" cho họ là một lời hứa sai về tiền.
 *
 * Ghép chuỗi tại chỗ ở hai màn là hai cơ hội để một trong hai ca trên biến mất. Phép suy sống ở
 * `resolveAccountTrack` (`@xeprime/types`, dùng chung với app native), component này chỉ vẽ.
 *
 * ## Hai pha còn lại rơi đúng chỗ mà không cần luật riêng
 *
 * `grace` giữ `billingMode = package` ⇒ vẫn là **gian hàng** (họ đã trả tiền, ân hạn không lấy
 * đi gì). `lapsed` thành `commission` ⇒ thành **chủ xe cá nhân** ngay, không chờ job vòng đời.
 * Cả hai do `resolveEffectiveBilling` giải TRƯỚC khi `billingMode` đi trên dây, nên nhãn và
 * menu đổi cùng lúc với `/auth/me` — không có màn nào nói một tuyến khác màn kia.
 */
export function AccountTrackBadge({
  tenant,
  size = 'default',
}: {
  tenant: AccountTrackInput | null | undefined;
  /** `small` cho chỗ chật (dropdown avatar trên mobile); `default` cho thẻ tài khoản. */
  size?: 'small' | 'default';
}) {
  const t = useTranslations('Account.trackBadge');
  const { track, roleKey, planName, serviceFeePercent } = resolveAccountTrack(tenant);

  if (track === ACCOUNT_TRACK.RENTER) return null;

  const className = size === 'small' ? styles.small : styles.badge;

  /*
   * ĐANG CHỜ THANH TOÁN (ADR 0040) — thẻ TRUNG TÍNH, và nó phải đứng trước nhánh `unconfigured`.
   * Cùng `billingMode: null`, nhưng một bên là việc của người dùng còn một bên là sự cố của nền
   * tảng; dùng `color="error"` cho cả hai là gắn nhãn "hỏng" lên mọi gian hàng vừa mở.
   */
  if (track === ACCOUNT_TRACK.PACKAGE_PENDING) {
    return (
      <Tooltip title={t('packagePendingHint')}>
        <Tag color="processing" className={className}>
          {t('packagePending')}
        </Tag>
      </Tooltip>
    );
  }

  if (track === ACCOUNT_TRACK.UNCONFIGURED) {
    return (
      <Tooltip title={t('unconfiguredHint')}>
        <Tag color="error" className={className}>
          {t('unconfigured')}
        </Tag>
      </Tooltip>
    );
  }

  if (track === ACCOUNT_TRACK.SHOP_MEMBER) {
    return (
      <Tag color="default" className={className}>
        {t(accountTrackLabelKey(track, roleKey) ?? 'shopMember')}
      </Tag>
    );
  }

  if (track === ACCOUNT_TRACK.SHOP_OWNER) {
    /*
     * DẤU XÁC THỰC, không phải một màu trạng thái.
     *
     * Chủ gian hàng là người đã đi qua vòng duyệt hồ sơ của nền tảng VÀ đang trả tiền thuê bao —
     * hai điều mà khách nhìn vào một cái tên không thể tự biết. Dấu tích vàng nói đúng điều đó,
     * cùng ngôn ngữ thị giác với mọi dấu xác thực khác mà người dùng đã quen.
     *
     * Vàng là màu THƯƠNG HIỆU ở đây, không phải tín hiệu cảnh báo: chữ lấy `--xp-color-text` chứ
     * không lấy `--xp-gold-deep` (gold-deep trên gold-wash chỉ đạt 3.68, trượt AA), và màu vàng
     * dồn vào đúng cái tích — thứ không mang chữ nên không có ngưỡng tương phản của chữ.
     */
    return (
      <Tag
        bordered={false}
        className={cx(className, styles.verified)}
        icon={<CheckCircleFilled className={styles.verifiedMark} />}
      >
        {planName ? t('shopOwnerWithPlan', { plan: planName }) : t('shopOwner')}
      </Tag>
    );
  }

  /*
   * Chủ xe cá nhân. `serviceFeePercent` là % ĐANG THU theo chính sách phí hiệu lực, không phải
   * hằng 10 chép tay và cũng không phải ảnh chụp % trên dòng thuê bao — xem
   * `CurrentTenantSummaryDto.serviceFeePercent`. Thiếu số thì nhãn rút gọn, KHÔNG bịa 10%.
   */
  return (
    <Tag color="green" className={className}>
      {serviceFeePercent == null
        ? t('commissionOwner')
        : t('commissionOwnerWithFee', { percent: serviceFeePercent })}
    </Tag>
  );
}
