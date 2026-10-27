'use client';

import { ClockCircleOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { HOLD_COUNTDOWN_URGENT_MINUTES } from '@xeprime/types';
import { Countdown } from '@/components/data-display/Countdown';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import type { CustomerTripDetail } from '../types';
import styles from './FreeCancelCountdown.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Dòng HUỶ MIỄN PHÍ đặt ngay dưới đồng hồ hạn thanh toán — ADR 0072.
 *
 * Huỷ miễn phí đếm từ lúc tiền giữ chỗ về ĐỦ, không từ lúc chủ xe nhận chuyến:
 *
 *  - **Chưa trả đủ** (`freeCancelStarted = false`): KHÔNG có đồng hồ nào chạy — chưa có đơn để huỷ, và
 *    không trả thì hết hạn là tự huỷ. Dòng này chỉ nói trước "trả xong thì được huỷ miễn phí trong
 *    {N}" (số phút server xem trước cho lúc trả NGAY, không tính ở client).
 *  - **Đã trả đủ**: đồng hồ đếm ngược tới mốc ĐÃ LƯU.
 *
 * Chuyến không có huỷ miễn phí (`freeCancelAvailable = false`) không vẽ gì — câu lưu ý đã nói rõ.
 */
export function FreeCancelCountdown({ hold, className }: { hold: Hold; className?: string }) {
  const t = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  if (!hold.freeCancelAvailable) return null;
  if (!hold.freeCancelStarted) {
    return (
      <p className={cx(styles.preview, className)}>
        <ClockCircleOutlined aria-hidden />{' '}
        {t('freeCancelFromPaymentShort', {
          duration: fmt.minutesDuration(hold.freeCancelMinutes),
        })}
      </p>
    );
  }
  return (
    <Countdown
      deadline={hold.freeCancelUntil}
      urgentMs={HOLD_COUNTDOWN_URGENT_MINUTES * 60_000}
      className={className}
      labels={{
        remaining: t('freeCancelCountdown'),
        expired: t('freeCancelCountdownExpired'),
      }}
    />
  );
}
