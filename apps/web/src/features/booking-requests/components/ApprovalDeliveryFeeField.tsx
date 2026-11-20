'use client';

import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/form/MoneyInput';
import type { ApproveBookingRequestInput } from '../types';
import styles from './ApprovalDeliveryFeeField.module.css';

/** Trần ô nhập — chặn gõ nhầm thêm vài số 0; phí giao nhận thật chưa bao giờ tới mức này. */
const DELIVERY_FEE_MAX = 50_000_000;

/**
 * Ô "Phí giao xe tận nơi" ở hộp duyệt — biên bản họp 19/11/2026: bước xác nhận duyệt của luồng giao
 * tận nơi thiếu phí giao xe. Chủ xe đã thống nhất với khách thì nhập luôn ở đây; server đưa phí vào
 * snapshot giá như dòng `delivery` — khách trả tận tay khi nhận xe, không cộng vào tiền giữ chỗ.
 * Bỏ trống = miễn phí như trước, vẫn sửa được trên đơn sau.
 */
export function ApprovalDeliveryFeeField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('BookingRequests');
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {t('approve.deliveryFeeLabel')}
      </label>
      <MoneyInput
        id={id}
        className={styles.input}
        min={0}
        max={DELIVERY_FEE_MAX}
        value={value}
        onChange={(next) => onChange(typeof next === 'number' ? next : null)}
        placeholder={t('approve.deliveryFeePlaceholder')}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`} className={styles.hint}>
        {t('approve.deliveryFeeHint')}
      </span>
    </div>
  );
}

/** Phần thân lượt duyệt cho phí giao xe — trống/0 thì không gửi gì (server hiểu là miễn phí). */
export function deliveryFeeBody(
  fee: number | null,
): Pick<ApproveBookingRequestInput, 'deliveryFee'> {
  return fee != null && fee > 0 ? { deliveryFee: String(Math.round(fee)) } : {};
}
