'use client';

import { useTranslations } from 'next-intl';
import { HOLD_COUNTDOWN_URGENT_MINUTES, isFreeCancelWindowShort } from '@xeprime/types';
import { Countdown } from '@/components/data-display/Countdown';
import type { CustomerTripDetail } from '../types';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Đồng hồ đếm ngược tới MỐC HUỶ MIỄN PHÍ — đặt ngay dưới đồng hồ hạn thanh toán (ADR 0032 điều 5 ·
 * ADR 0066).
 *
 * Chỉ hiện khi mốc huỷ miễn phí đóng TRƯỚC hạn thanh toán (`isFreeCancelWindowShort` — chuyến cận
 * ngày: huỷ 20% ΔT, trả 30% ΔT). Khi đó khách trả ở cuối hạn là đã mất quyền huỷ miễn phí, và một
 * dòng "trước 14:35" tĩnh trong phần lưu ý không đủ để họ nhận ra điều đó trước khi bấm trả. Hai
 * mốc trùng nhau (chuyến xa) thì đồng hồ thanh toán đã nói đủ — vẽ thêm là vẽ một con số y hệt.
 *
 * Mốc đọc từ server (`freeCancelUntil` đã lưu), không tính lại ở client.
 */
export function FreeCancelCountdown({ hold, className }: { hold: Hold; className?: string }) {
  const t = useTranslations('Trips.hold');
  if (!hold.freeCancelAvailable || !isFreeCancelWindowShort(hold)) return null;
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
