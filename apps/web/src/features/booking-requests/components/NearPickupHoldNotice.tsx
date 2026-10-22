'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { holdWindowsPreview } from '@xeprime/types';
import type { PublicQuote } from '@/features/rental-policies/types';
import { useNow } from '@/hooks/use-now';
import { appWallClockToIso, type Dayjs } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';

const MINUTE_MS = 60_000;

/**
 * Cảnh báo ĐẶT SÁT GIỜ trước khi khách gửi yêu cầu — ADR 0032 điều 5 · ADR 0064.
 *
 * Cửa sổ thanh toán (30% của ΔT) và cửa sổ huỷ miễn phí (20% của ΔT) co theo khoảng cách từ lúc
 * chủ xe nhận tới giờ nhận xe (`holdWindowsFor`, ADR 0066). Khách phải biết điều đó TRƯỚC khi
 * gửi, không phải phát hiện lúc đã trả. Ước tính giả định chủ xe nhận NGAY — gắn nhãn rõ: mốc thật
 * chỉ có khi chủ xe nhận chuyến (server tính và lưu).
 *
 * Không vẽ gì khi cả hai cửa sổ còn TRỌN trần của chính sách (chuyến đủ xa) VÀ có huỷ miễn phí,
 * hoặc chuyến không thu tiền giữ chỗ. So với trần chứ không với một ngưỡng giờ cố định: trần là
 * dữ liệu chính sách phí. Chính sách tắt huỷ miễn phí (`freeCancelHours = 0`) thì luôn báo.
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
  const nowDate = new Date(now);
  const windows = holdWindowsPreview({
    now: nowDate,
    pickupAt: new Date(appWallClockToIso(pickupAt)),
    freeCancelHours: fees.policy.freeCancelHours,
    paymentWindowMinutes: fees.policy.holdPaymentWindowMinutes,
  });
  // Cửa sổ huỷ miễn phí THẬT — đã kẹp bởi giờ nhận xe; 0 khi chính sách tắt (`freeCancelHours = 0`).
  const freeCancelMinutes = Math.max(
    0,
    Math.round((windows.freeCancelUntil.getTime() - nowDate.getTime()) / MINUTE_MS),
  );
  const nearPickup =
    windows.paymentWindowMinutes < fees.policy.holdPaymentWindowMinutes ||
    windows.freeCancelMinutes < fees.policy.freeCancelHours * 60;
  /*
   * Không có huỷ miễn phí là điều khách PHẢI biết trước khi gửi, kể cả chuyến đặt xa: chính sách
   * tắt huỷ miễn phí thì hai cửa sổ "đã chạm trần" vẫn là một cửa sổ huỷ bằng 0.
   */
  const noFreeCancel = freeCancelMinutes === 0;
  if (!windows.tooShort && !nearPickup && !noFreeCancel) return null;

  const payment = fmt.minutesDuration(windows.paymentWindowMinutes);
  const body = windows.tooShort
    ? t('tooShort')
    : noFreeCancel
      ? t('noFreeCancel', { payment })
      : t('short', { payment, freeCancel: fmt.minutesDuration(freeCancelMinutes) });
  // Chuyến đủ xa mà chỉ thiếu huỷ miễn phí thì không phải "đặt sát giờ" — tiêu đề nói đúng chuyện.
  const title = windows.tooShort || nearPickup ? t('title') : t('noFreeCancelTitle');

  return <Alert type="warning" showIcon title={title} description={`${body} ${t('estimate')}`} />;
}
