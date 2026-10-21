'use client';

import { isFreeCancelWindowShort } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import type { CustomerTripDetail } from './types';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Câu "huỷ thế nào thì tiền đi đâu" của MỘT khoản giữ chỗ — ba trạng thái, một nguồn (ADR 0064):
 *
 *  - **Không có thời gian huỷ miễn phí** (`freeCancelAvailable = false` — đặt gấp): KHÔNG in một mốc
 *    "trước {giờ}" đã nằm trong quá khứ; nói thẳng là không có, và huỷ sau khi trả thì mất gì.
 *  - **Cửa sổ ngắn** (bị kẹp bởi giờ nhận xe, đóng không muộn hơn hạn thanh toán).
 *  - **Thường lệ**.
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
    const time = fmt.dateTime(hold.freeCancelUntil);
    const lead = isFreeCancelWindowShort(hold)
      ? t('freeCancelSoon', { time })
      : t('freeCancel', { time });
    const late = hasRefund ? t('lateCancelRefund', { amount }) : t('lateCancelNoRefund');
    return `${lead} ${late}`;
  };
}
