import {
  hostMetricState,
  HOST_METRIC_STATE,
  type HostMetrics as HostMetricsShape,
} from '@xeprime/types';

/** Số lượt đánh giá tối thiểu để được NÓI về điểm đánh giá — dưới mức này một lượt 5 sao đã kéo trung bình lên kịch trần. */
const MIN_RATING_COUNT = 5;
const GREAT_RATING = 4.8;
const GOOD_RATING = 4.5;
const GREAT_RATE_PERCENT = 90;

export type ShopHighlightKey =
  | 'topRated'
  | 'reliable'
  | 'wellRated'
  | 'instantBook'
  | 'experienced'
  | 'newHost';

export interface ShopHighlight {
  key: ShopHighlightKey;
  /** Điểm đánh giá thô — nơi gọi tự định dạng theo locale trước khi đưa vào câu. */
  rating: number | null;
  /** Số lượt đánh giá hoặc số chuyến, tuỳ câu đang dùng. */
  count: number;
}

/**
 * Chọn MỘT câu giới thiệu ngắn cho thẻ gian hàng — luôn có một câu, không bao giờ để trống.
 *
 * ## Vì sao là một câu CHO MỌI gian hàng, không phải huy hiệu cho người giỏi
 *
 * Một dải chỉ hiện với gian hàng xuất sắc thì với 90% gian hàng còn lại, chỗ đó là một khoảng
 * trống — và thẻ trông như đang thiếu một phần. Câu ở đây luôn nói được điều gì đó ĐÚNG về gian
 * hàng đang xem: giỏi thì khen đúng chỗ giỏi, mới mở thì nói thẳng là mới.
 *
 * ## Không câu nào được nói quá những gì số liệu cho phép
 *
 * Thứ tự dưới đây đi từ khẳng định MẠNH nhất xuống yếu nhất, và mỗi bậc chỉ đạt được khi có đủ
 * số liệu cho đúng điều nó nói:
 *
 *   1. `topRated` — đánh giá cao (đủ lượt) VÀ phản hồi tốt VÀ giữ chuyến tốt;
 *   2. `reliable` — phản hồi tốt VÀ giữ chuyến tốt, nhưng chưa đủ điểm đánh giá để khen thêm;
 *   3. `wellRated` — chỉ nói về điểm đánh giá, vì chỉ có dữ liệu đó;
 *   4. `instantBook` — chưa có số liệu vận hành, nhưng "nhận tự động" là một CÀI ĐẶT có thật;
 *   5. `experienced` — chưa có gì ở trên, nhưng đã chạy thật được bằng này chuyến;
 *   6. `newHost` — chưa có chuyến nào, và nói thẳng như vậy.
 *
 * Tỉ lệ phần trăm chỉ được đọc khi `hostMetricState` báo ĐỦ MẪU — đúng ngưỡng mà ba chỉ số hiển
 * thị đang dùng, nên câu này không bao giờ khen một gian hàng mà ba ô số ngay trên nó đang nói
 * "chưa đủ dữ liệu".
 */
export function shopHighlightOf({
  metrics,
  ratingAvg,
  ratingCount = 0,
  completedTripCount = 0,
}: {
  metrics: HostMetricsShape | null | undefined;
  ratingAvg: number | null;
  ratingCount?: number;
  completedTripCount?: number;
}): ShopHighlight {
  const ready = !!metrics && hostMetricState(metrics.sampleCount) === HOST_METRIC_STATE.READY;
  const responseRate = ready ? metrics.responseRatePercent : null;
  const acceptKeepRate = ready ? metrics.acceptKeepRatePercent : null;
  const greatRates =
    responseRate !== null &&
    responseRate >= GREAT_RATE_PERCENT &&
    acceptKeepRate !== null &&
    acceptKeepRate >= GREAT_RATE_PERCENT;

  const rating =
    ratingCount >= MIN_RATING_COUNT && ratingAvg !== null && Number.isFinite(ratingAvg)
      ? ratingAvg
      : null;

  if (rating !== null && rating >= GREAT_RATING && greatRates) {
    return { key: 'topRated', rating, count: ratingCount };
  }
  if (greatRates) return { key: 'reliable', rating: null, count: 0 };
  if (rating !== null && rating >= GOOD_RATING) {
    return { key: 'wellRated', rating, count: ratingCount };
  }
  if (metrics?.instantBook) return { key: 'instantBook', rating: null, count: 0 };
  if (completedTripCount > 0) {
    return { key: 'experienced', rating: null, count: completedTripCount };
  }
  return { key: 'newHost', rating: null, count: 0 };
}
