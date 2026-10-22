'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { OwnerPayoutTable } from '@/features/bookings/components/OwnerPayoutTable';
import { useAppFormat } from '@/i18n/use-app-format';
import type { BookingRequestItem } from '../types';
import styles from './ApprovalPreviewSummary.module.css';

export type ApprovalPreview = NonNullable<BookingRequestItem['approvalPreview']>;
export type ApprovalWindows = NonNullable<ApprovalPreview['windows']>;

/**
 * XEM TRƯỚC lượt duyệt cho gian hàng — tiền của chủ xe và hai cửa sổ của khách NẾU duyệt ngay
 * (ADR 0064). Mọi con số do server tính (`approvalPreview`); `windows` của dài hạn được nơi gọi
 * dựng bằng đúng `holdWindowsFor` trên giờ nhận vừa chọn. Luôn gắn nhãn ƯỚC TÍNH — số chốt đóng
 * băng lúc duyệt (ADR 0024).
 *
 * Đây là DTO nội bộ của gian hàng: phí dịch vụ – chủ xe, thuế và số thực nhận của CHỦ XE hiện ở
 * đây là đúng chỗ — khách không bao giờ thấy khối này. Phần tiền là bảng cộng ví dùng CHUNG với chi
 * tiết đơn (`OwnerPayoutTable`, ADR 0068 điều 5); các ghi chú cửa sổ thanh toán/huỷ đứng dưới nó.
 */
export function ApprovalPreviewSummary({
  preview,
  windows,
  windowsPendingHint,
  showMoney = true,
}: {
  preview: ApprovalPreview;
  /** Hai cửa sổ nếu duyệt ngay — `undefined` = dùng `preview.windows` của server. */
  windows?: ApprovalWindows | null;
  /** Câu thay cho khối cửa sổ khi chưa có giờ nhận (dài hạn chưa chọn giờ). */
  windowsPendingHint?: string;
  /**
   * `false` = chỉ hiện hai cửa sổ, không hiện dòng tiền — khi số tiền server ước KHÔNG phải tiền
   * của chuyến này (yêu cầu dài hạn LEGACY chưa mang gói).
   */
  showMoney?: boolean;
}) {
  const t = useTranslations('BookingRequests.approvalPreview');
  const fmt = useAppFormat();
  const w = windows === undefined ? preview.windows : windows;

  return (
    <section className={styles.root} aria-label={t('title')}>
      <header className={styles.header}>
        <span className={styles.title}>{t('title')}</span>
        <span className={styles.badge}>{t('estimate')}</span>
      </header>

      {showMoney ? <OwnerPayoutTable payout={preview.ownerPayout} label={t('title')} /> : null}

      {!preview.collectsHold ? (
        <p className={styles.note}>{t('noHold')}</p>
      ) : w ? (
        <>
          <ul className={styles.notes}>
            <li>
              {t('paymentWindow', {
                duration: fmt.minutesDuration(w.paymentWindowMinutes),
                time: fmt.dateTime(w.expiresAt),
              })}
            </li>
            <li>
              {w.freeCancelMinutes > 0
                ? t('freeCancel', {
                    duration: fmt.minutesDuration(w.freeCancelMinutes),
                    time: fmt.dateTime(w.freeCancelUntil),
                  })
                : t('noFreeCancel')}
            </li>
            <li>{t('lateCancel')}</li>
          </ul>
          {w.tooShort ? <Alert type="warning" showIcon title={t('tooShort')} /> : null}
        </>
      ) : windowsPendingHint ? (
        <p className={styles.note}>{windowsPendingHint}</p>
      ) : null}
    </section>
  );
}
