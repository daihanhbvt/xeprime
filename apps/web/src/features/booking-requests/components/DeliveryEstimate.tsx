'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { DELIVERY_DISTANCE_STATUS, DELIVERY_MANUAL_REASON } from '@xeprime/types';

import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import type { DeliveryDistance } from '@/features/rental-policies/types';

import styles from './DeliveryEstimate.module.css';

/**
 * Quãng đường + phí giao xe **DỰ KIẾN** cho khách, ngay dưới ô địa chỉ giao (ADR 0018).
 *
 * Ba điều đóng đinh ở đây:
 *
 *  - **Không con số nào ở đây đi vào đơn.** Chủ xe vẫn là người chốt phí (ADR 0014), nên mọi
 *    nhãn nói "dự kiến" và không có nút nào cho khách duyệt phí.
 *  - **Không chặn gửi yêu cầu.** Ngoài phạm vi chỉ nghĩa là không tự báo giá được, không phải
 *    "không giao được" — nên nó là một cảnh báo kèm lối đi tiếp, không phải một lỗi.
 *  - **Giao diện đọc MÃ, không đoán từ câu chữ của nhà cung cấp** (ADR 0012). `manualReason` do
 *    backend phân loại; vắng mặt (bản ghi/client cũ) thì `manual` giữ nghĩa lịch sử "ngoài bán
 *    kính tự báo".
 *
 * Tách khỏi `RequestBookingFlow` vì đây là một khối THUẦN HIỂN THỊ với bảy ngả rẽ — để lại
 * trong cây JSX 500 dòng của luồng đặt xe thì không ai đọc nổi, và cũng không test riêng được.
 */
export function DeliveryEstimate({
  /** Đang chờ kết quả cho ĐỊA CHỈ HIỆN TẠI — gồm cả quãng debounce chưa trôi hết. */
  pending,
  /** Kết quả cho đúng địa chỉ/ghim đang hiển thị. `null` khi chưa có hoặc đã cũ. */
  result,
}: {
  pending: boolean;
  result: DeliveryDistance | null;
}) {
  const t = useTranslations('BookingRequests.flow.pickup');
  const fmt = useAppFormat();

  if (pending) {
    return (
      <p className={styles.note} role="status">
        {t('estimating')}
      </p>
    );
  }

  /*
   * Chưa gõ đủ địa chỉ, chưa cấu hình bản đồ, hoặc chính sách không bật giao nhận — cùng một
   * câu cũ: hai bên trao đổi trực tiếp. Luồng đặt xe không đổi hành vi khi bản đồ vắng mặt, nó
   * chỉ mất phần ước lượng.
   */
  if (
    !result ||
    result.status === DELIVERY_DISTANCE_STATUS.UNSUPPORTED ||
    result.status === DELIVERY_DISTANCE_STATUS.UNAVAILABLE
  ) {
    return <p className={styles.note}>{t('feeNote')}</p>;
  }

  if (result.status === DELIVERY_DISTANCE_STATUS.ADDRESS_NOT_FOUND) {
    // Việc khách SỬA ĐƯỢC — nói thẳng phải sửa gì, và tuyệt đối không gọi nó là "ngoài phạm vi".
    return (
      <Alert
        type="info"
        showIcon
        title={t('addressNotFoundTitle')}
        description={t('addressNotFound')}
      />
    );
  }

  if (result.status === DELIVERY_DISTANCE_STATUS.AUTO) {
    const fee = result.fee ?? '0';
    return (
      <div className={styles.block}>
        <div className={styles.feeRow}>
          <span>{t('feeLabel')}</span>
          <b className={isZeroMoney(fee) ? styles.freeTag : undefined}>
            {isZeroMoney(fee) ? t('feeFree') : fmt.money(fee)}
          </b>
        </div>
        <p className={styles.note}>
          {t('estimatedDistance', { distance: fmt.distanceKm(result.distanceKm) })}
        </p>
        {result.formattedAddress ? (
          <p className={styles.note}>
            {t('resolvedAddress', { address: result.formattedAddress })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.block}>
      <ManualNotice result={result} />
      {result.formattedAddress ? (
        <p className={styles.note}>{t('resolvedAddress', { address: result.formattedAddress })}</p>
      ) : null}
    </div>
  );
}

/**
 * Ba lý do `manual`, ba câu khác nhau — và chỉ MỘT trong ba nói "ngoài phạm vi".
 *
 * Trước 21/09/2026 cả ba dùng chung một dòng, nên một địa chỉ ngay trong thành phố vẫn bị báo là
 * quá xa chỉ vì nhà cung cấp bản đồ timeout. Khách không sửa được thứ đó, và câu kia làm họ đi
 * sửa một địa chỉ vốn đúng.
 */
function ManualNotice({ result }: { result: DeliveryDistance }) {
  const t = useTranslations('BookingRequests.flow.pickup');
  const fmt = useAppFormat();

  if (result.manualReason === DELIVERY_MANUAL_REASON.PROVIDER_UNAVAILABLE) {
    // Lỗi phía hệ thống: im lặng rơi về luồng cũ (ADR 0018 §4) — không đổ một cảnh báo lên đầu
    // khách vì một sự cố họ không liên quan và không làm gì được.
    return <p className={styles.note}>{t('feeNote')}</p>;
  }

  if (result.manualReason === DELIVERY_MANUAL_REASON.ROUTE_UNAVAILABLE) {
    return (
      <Alert
        type="info"
        showIcon
        title={t('routeUnavailableTitle')}
        description={
          <span className={styles.alertBody}>
            <span>{t('routeUnavailableBody')}</span>
            <span>{t('stillCanSubmit')}</span>
          </span>
        }
      />
    );
  }

  /*
   * Ngoài bán kính — kể cả khi `manualReason` vắng mặt (client/bản ghi trước 21/09/2026), vì đó
   * đúng là nghĩa lịch sử của `manual`.
   *
   * Hai loại khoảng cách KHÔNG được gọi bằng một tên: `distanceKm` là đường bộ đo thật, còn
   * `straightLineKm` là đường chim bay dùng để loại sớm mà không tốn một request bản đồ nào.
   */
  const radius = result.maxRadiusKm;
  const reason =
    result.distanceKm != null && radius != null
      ? t('outsideRadiusRoad', {
          distance: fmt.distanceKm(result.distanceKm),
          radius: fmt.km(radius),
        })
      : result.straightLineKm != null && radius != null
        ? t('outsideRadiusStraight', {
            distance: fmt.distanceKm(result.straightLineKm),
            radius: fmt.km(radius),
          })
        : result.distanceKm != null
          ? t('manualWithDistance', { distance: fmt.distanceKm(result.distanceKm) })
          : t('outsideRadiusUnknown');

  return (
    <Alert
      type="warning"
      showIcon
      title={t('outsideRadiusTitle')}
      description={
        <span className={styles.alertBody}>
          <span>{reason}</span>
          <span>{t('stillCanSubmit')}</span>
        </span>
      }
    />
  );
}
