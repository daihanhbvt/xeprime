'use client';

import { useTranslations } from 'next-intl';
import type { PublicQuote } from '@/features/rental-policies/types';
import { customerTotalView } from '@/lib/customer-price-view';

/**
 * Dòng TỔNG của một báo giá — nhãn + số tiền — cho thẻ chi phí của màn Xem lại và thẻ chuyến của
 * hộp "Đã gửi yêu cầu". Luật chọn tên ở `customerTotalView`; ở đây chỉ dịch tên đó ra chữ.
 *
 * `null` khi chưa có báo giá: nơi gọi tự quyết bỏ dòng hay hiện trạng thái chờ.
 */
export function useQuoteTotal(
  breakdown: PublicQuote['breakdown'] | null | undefined,
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
          : t('price.total'),
    amount: total.amount,
  };
}
