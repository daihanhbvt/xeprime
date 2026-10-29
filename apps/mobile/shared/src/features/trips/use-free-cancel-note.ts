import { isZeroMoney } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import type { CustomerTripDetail } from './api';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Câu "huỷ thế nào thì tiền đi đâu" của MỘT khoản giữ chỗ — bản native của
 * `apps/web/src/features/trips/use-free-cancel-note.ts` (ADR 0064 · ADR 0072):
 *
 *  - **Không có thời gian huỷ miễn phí** (`freeCancelAvailable = false`): không in một mốc đã qua;
 *    nói thẳng là không có, và huỷ sau khi trả thì mất gì.
 *  - **Chưa trả đủ**: huỷ miễn phí chỉ bắt đầu từ lúc thanh toán thành công (ADR 0072) — nói độ dài
 *    cửa sổ (server xem trước cho lúc trả ngay), không nói một giờ cụ thể vì nó chưa tồn tại.
 *  - **Đã trả đủ**: mốc ĐÃ LƯU.
 *
 * Mỗi trạng thái nối thêm câu HUỶ MUỘN theo `lateCancelRefundAmount` server tính. Client không
 * cộng trừ gì, chỉ chọn câu.
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
    const lead =
      hold.freeCancelStarted && hold.freeCancelUntil
        ? t('freeCancel', { time: fmt.dateTime(hold.freeCancelUntil) })
        : t('freeCancelFromPayment', { duration: fmt.minutesDuration(hold.freeCancelMinutes) });
    const late = hasRefund ? t('lateCancelRefund', { amount }) : t('lateCancelNoRefund');
    return `${lead} ${late}`;
  };
}
