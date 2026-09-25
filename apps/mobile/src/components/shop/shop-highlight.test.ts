import { EMPTY_HOST_METRICS, type HostMetrics } from '@xeprime/types';
import { shopHighlightOf } from './shop-highlight';

/**
 * `shopHighlightOf` chọn MỘT câu khẳng định công khai về một gian hàng, nên mọi bậc của nó là
 * một lời hứa: bậc sai là app nói về người bán một điều số liệu không đỡ nổi.
 *
 * Bản web (`apps/web/src/components/shop/shop-highlight.ts`) dùng ĐÚNG các ngưỡng này — hai bên
 * lệch nhau là cùng một gian hàng có hai lý lịch (ADR 0031: hai bản không tự đồng bộ).
 */
function metrics(over: Partial<HostMetrics> = {}): HostMetrics {
  return { ...EMPTY_HOST_METRICS, ...over };
}

/** Đủ mẫu + hai tỉ lệ ≥ 90% — điều kiện của hai bậc mạnh nhất. */
const GREAT = metrics({ sampleCount: 20, responseRatePercent: 95, acceptKeepRatePercent: 92 });

describe('shopHighlightOf', () => {
  it('đánh giá cao + vận hành tốt ⇒ topRated, mang theo điểm và số lượt', () => {
    expect(shopHighlightOf({ metrics: GREAT, ratingAvg: 4.9, ratingCount: 12 })).toEqual({
      key: 'topRated',
      rating: 4.9,
      count: 12,
    });
  });

  /**
   * Dưới 5 lượt đánh giá thì KHÔNG được nói về điểm — một lượt 5 sao đã kéo trung bình lên kịch
   * trần. Vận hành vẫn tốt nên nó rơi xuống `reliable`, bậc chỉ nói về phản hồi/giữ chuyến.
   */
  it('ít lượt đánh giá thì bỏ qua điểm, rơi xuống reliable', () => {
    expect(shopHighlightOf({ metrics: GREAT, ratingAvg: 5, ratingCount: 4 })).toEqual({
      key: 'reliable',
      rating: null,
      count: 0,
    });
  });

  it('chỉ có điểm đánh giá tốt (vận hành chưa đạt) ⇒ wellRated', () => {
    const ok = metrics({ sampleCount: 20, responseRatePercent: 60, acceptKeepRatePercent: 60 });
    expect(shopHighlightOf({ metrics: ok, ratingAvg: 4.6, ratingCount: 9 })).toEqual({
      key: 'wellRated',
      rating: 4.6,
      count: 9,
    });
  });

  /**
   * CHƯA ĐỦ MẪU thì hai tỉ lệ không được đọc, kể cả khi chúng có giá trị.
   *
   * Đây là ràng buộc quan trọng nhất của hàm: ba ô số ngay trên câu này đang hiện "chưa đủ dữ
   * liệu", nên một câu khen dựa trên chính hai con số đó là tự mâu thuẫn ngay trong một thẻ.
   */
  it('chưa đủ mẫu thì KHÔNG đọc tỉ lệ, dù tỉ lệ đang đẹp', () => {
    const thin = metrics({ sampleCount: 0, responseRatePercent: 100, acceptKeepRatePercent: 100 });
    expect(shopHighlightOf({ metrics: thin, ratingAvg: null, completedTripCount: 8 })).toEqual({
      key: 'experienced',
      rating: null,
      count: 8,
    });
  });

  it('chưa có số liệu vận hành nhưng bật Đặt ngay ⇒ instantBook', () => {
    const instant = metrics({ sampleCount: 0, instantBook: true });
    expect(shopHighlightOf({ metrics: instant, ratingAvg: null, completedTripCount: 3 }).key).toBe(
      'instantBook',
    );
  });

  it('chưa có gì thì nói thẳng là chủ xe mới', () => {
    expect(shopHighlightOf({ metrics: null, ratingAvg: null })).toEqual({
      key: 'newHost',
      rating: null,
      count: 0,
    });
  });

  /** `metrics` vắng mặt (body cache cũ) không được ném — thẻ vẫn phải dựng. */
  it('không có metrics vẫn chọn được câu từ phần còn lại', () => {
    expect(
      shopHighlightOf({ metrics: undefined, ratingAvg: 4.7, ratingCount: 30 }).key,
    ).toBe('wellRated');
  });

  /** `ratingAvg` hỏng (NaN từ một chuỗi rỗng) phải bị loại, không lọt vào câu. */
  it('điểm không phải số thì bỏ qua', () => {
    expect(shopHighlightOf({ metrics: null, ratingAvg: Number('x'), ratingCount: 30 }).key).toBe(
      'newHost',
    );
  });
});
