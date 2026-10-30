import { useTranslations } from 'use-intl';
import { holdWindowsPreview } from '@xeprime/types';
import type { PublicQuote } from '@/api/marketplace/api';
import { Callout } from '@/components/ui/Callout';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';

const MINUTE_MS = 60_000;

/**
 * Cảnh báo ĐẶT SÁT GIỜ trước khi khách gửi yêu cầu — bản native của `NearPickupHoldNotice` web
 * (ADR 0032 điều 5 · ADR 0064 · ADR 0066).
 *
 * Cửa sổ thanh toán và huỷ miễn phí co theo khoảng cách từ lúc chủ xe nhận tới giờ nhận xe
 * (`holdWindowsPreview` — cùng hàm web). Ước tính giả định chủ xe nhận NGAY; mốc thật chỉ có khi
 * chủ xe nhận chuyến (server tính và lưu). Không vẽ gì khi cả hai cửa sổ còn TRỌN trần của chính
 * sách VÀ có huỷ miễn phí, hoặc chuyến không thu tiền giữ chỗ.
 */
export function NearPickupHoldNotice({
  pickupAt,
  fees,
}: {
  /** Giờ nhận khách chọn — mốc ISO (form native lưu thời điểm, không phải giờ tường). */
  pickupAt: string | null | undefined;
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
    pickupAt: new Date(pickupAt),
    freeCancelHours: fees.policy.freeCancelHours,
    paymentWindowMinutes: fees.policy.holdPaymentWindowMinutes,
  });
  // Cửa sổ huỷ miễn phí THẬT — đã kẹp bởi giờ nhận xe; 0 khi chính sách tắt huỷ miễn phí.
  const freeCancelMinutes = Math.max(
    0,
    Math.round((windows.freeCancelUntil.getTime() - nowDate.getTime()) / MINUTE_MS),
  );
  const nearPickup =
    windows.paymentWindowMinutes < fees.policy.holdPaymentWindowMinutes ||
    windows.freeCancelMinutes < fees.policy.freeCancelHours * 60;
  // Không có huỷ miễn phí là điều khách PHẢI biết trước khi gửi, kể cả chuyến đặt xa.
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

  return (
    <Callout tone="warning" title={title}>
      {`${body} ${t('estimate')}`}
    </Callout>
  );
}
