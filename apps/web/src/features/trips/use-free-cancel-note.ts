'use client';

import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import type { CustomerTripDetail } from './types';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Câu "huỷ thế nào thì tiền đi đâu" của MỘT khoản giữ chỗ — một nguồn (ADR 0064 · ADR 0072):
 *
 *  - **Không có thời gian huỷ miễn phí** (`freeCancelAvailable = false` — chính sách tắt huỷ miễn
 *    phí, hoặc giờ nhận xe kẹp cửa sổ về 0): KHÔNG in một mốc đã nằm trong quá khứ; nói thẳng là
 *    không có, và huỷ sau khi trả thì mất gì.
 *  - **Chưa trả đủ**: huỷ miễn phí chỉ bắt đầu từ lúc thanh toán thành công (ADR 0072) — nói độ dài
 *    cửa sổ (server xem trước cho lúc trả ngay), không nói một giờ cụ thể vì nó chưa tồn tại.
 *  - **Đã trả đủ**: mốc ĐÃ LƯU.
 *
 * Mỗi trạng thái nối thêm câu HUỶ MUỘN: bảo hiểm hoàn đủ vào Ví điểm (`lateCancelRefundAmount` —
 * server tính bằng đúng phép chia lượt huỷ thật dùng), phần còn lại không hoàn. Client không cộng
 * trừ gì, chỉ chọn câu.
 */
export function useFreeCancelNote(): (hold: Hold) => string {
  const t = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  return (hold) => {
    const refund = hold.lateCancelRefundAmount;
    const hasRefund = !isZeroMoney(refund);
    const amount = fmt.money(refund);
    if (!hold.freeCancelAvailable) {
      return hasRefund ? t('noFreeCancelRefund', { amount }) : t('noFreeCancelNoRefund');
    }
    const lead = hold.freeCancelStarted
      ? t('freeCancel', { time: fmt.dateTime(hold.freeCancelUntil) })
      : t('freeCancelFromPayment', { duration: fmt.minutesDuration(hold.freeCancelMinutes) });
    const late = hasRefund ? t('lateCancelRefund', { amount }) : t('lateCancelNoRefund');
    return `${lead} ${late}`;
  };
}
