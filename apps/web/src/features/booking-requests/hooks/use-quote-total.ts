'use client';

import { useTranslations } from 'next-intl';
import { customerTotalView } from '@/lib/customer-price-view';

/**
 * Dòng TỔNG của một báo giá — nhãn + số tiền — cho thẻ chi phí của màn Xem lại, thẻ chuyến của hộp
 * "Đã gửi yêu cầu" và thẻ chi phí của chuyến đang chờ chủ xe phản hồi. Luật chọn tên ở
 * `customerTotalView`; ở đây chỉ dịch tên đó ra chữ.
 *
 * `null` khi chưa có báo giá: nơi gọi tự quyết bỏ dòng hay hiện trạng thái chờ.
 */
export function useQuoteTotal(
  breakdown: Parameters<typeof customerTotalView>[0] | null | undefined,
  /** Số đã CHỐT (bảng kê đóng băng) — tổng chỉ có tiền thuê thì là "Tổng tiền thuê", không "dự kiến". */
  opts: { frozen?: boolean } = {},
): { label: string; amount: string } | null {
  const t = useTranslations('BookingRequests.flow');
  const tCommon = useTranslations('Common');
  if (!breakdown) return null;
  const total = customerTotalView(breakdown);
  return {
    label:
      total.kind === 'subtotal'
        ? t('price.subtotal')
        : total.kind === 'customerTotal'
          ? tCommon('components.price.customerTotal')
          : opts.frozen
            ? t('price.totalFrozen')
            : t('price.total'),
    amount: total.amount,
  };
}
