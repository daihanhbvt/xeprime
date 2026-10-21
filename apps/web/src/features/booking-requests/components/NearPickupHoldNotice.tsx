'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { HOLD_DYNAMIC_WINDOW, holdWindowsPreview } from '@xeprime/types';
import type { PublicQuote } from '@/features/rental-policies/types';
import { useNow } from '@/hooks/use-now';
import { appWallClockToIso, type Dayjs } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Cảnh báo ĐẶT SÁT GIỜ trước khi khách gửi yêu cầu — ADR 0032 điều 5 · ADR 0064.
 *
 * Cửa sổ thanh toán và cửa sổ huỷ miễn phí co theo khoảng cách từ lúc chủ xe nhận tới giờ nhận xe
 * (`holdWindowsFor`); dưới 2 giờ thì không có huỷ miễn phí. Khách phải biết điều đó TRƯỚC khi gửi,
 * không phải phát hiện lúc đã trả. Ước tính giả định chủ xe nhận NGAY — gắn nhãn rõ: mốc thật chỉ
 * có khi chủ xe nhận chuyến (server tính và lưu).
 *
 * Không vẽ gì khi đặt xa (≥ 24 giờ: hai cửa sổ trọn vẹn) hoặc chuyến không thu tiền giữ chỗ.
 */
export function NearPickupHoldNotice({
  pickupAt,
  fees,
}: {
  /** Giờ nhận khách chọn (giờ tường VN). */
  pickupAt: Dayjs | null | undefined;
  fees: PublicQuote['breakdown']['fees'] | null | undefined;
}) {
  const t = useTranslations('BookingRequests.flow.nearPickup');
  const fmt = useAppFormat();
  const now = useNow();

  // Thiếu chính sách phí (báo giá cũ/rút gọn) thì không ước được cửa sổ — im lặng, không đoán.
  if (!pickupAt || !fees?.holdAmount || !fees.policy) return null;
  const windows = holdWindowsPreview({
    now: new Date(now),
    pickupAt: new Date(appWallClockToIso(pickupAt)),
    freeCancelHours: fees.policy.freeCancelHours,
    paymentWindowMinutes: fees.policy.holdPaymentWindowMinutes,
  });
  if (windows.leadMinutes >= HOLD_DYNAMIC_WINDOW.FAR_LEAD_HOURS * 60) return null;

  const payment = fmt.minutesDuration(windows.paymentWindowMinutes);
  const body = windows.tooShort
    ? t('tooShort')
    : windows.freeCancelMinutes > 0
      ? t('short', { payment, freeCancel: fmt.minutesDuration(windows.freeCancelMinutes) })
      : t('noFreeCancel', { payment });

  return (
    <Alert type="warning" showIcon title={t('title')} description={`${body} ${t('estimate')}`} />
  );
}
