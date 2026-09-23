import { deliveryEstimateState } from './delivery-estimate-state';

const S = (over: Partial<Parameters<typeof deliveryEstimateState>[0]> = {}) =>
  deliveryEstimateState({ typed: '', debounced: '', hasPin: false, fetching: false, ...over });

const LONG = '12 Lê Lợi, Quận 1'; // 17 ký tự
const SHORT = '12 Lê Lợi'; // 9 ký tự

describe('deliveryEstimateState', () => {
  it('địa chỉ còn ngắn ⇒ không hỏi, và KHÔNG treo spinner', () => {
    const s = S({ typed: SHORT, debounced: SHORT });
    expect(s.queryable).toBe(false);
    expect(s.askable).toBe(false);
  });

  it('LỆCH MỘT NHỊP: gõ tới ký tự thứ 12 nhưng debounce còn giữ chuỗi 11 ⇒ CHƯA gửi', () => {
    /*
     * Đây là ca mà một phép kiểm trên `typed` sẽ bật query và gửi đi chuỗi NGẮN — đúng thứ
     * ngưỡng sinh ra để chặn. Dựng bằng cách cho `typed` dài hơn `debounced`.
     */
    const s = S({ typed: LONG, debounced: SHORT });
    expect(s.queryable).toBe(false);
    // Giao diện vẫn phải nói "đang tính" — im lặng 600ms đọc ra như app đơ.
    expect(s.askable).toBe(true);
    expect(s.current).toBe(false);
  });

  it('debounce đã bắt kịp ⇒ hỏi, và kết quả được coi là của địa chỉ đang hiện', () => {
    const s = S({ typed: LONG, debounced: LONG });
    expect(s.queryable).toBe(true);
    expect(s.current).toBe(true);
  });

  it('SỬA địa chỉ sau khi đã có kết quả ⇒ kết quả cũ hết hiệu lực ngay', () => {
    // `typed` đã đổi, `debounced` còn là địa chỉ trước — số cũ nói về một chỗ khác.
    const s = S({ typed: LONG + ' B', debounced: LONG });
    expect(s.settled).toBe(false);
    expect(s.current).toBe(false);
  });

  it('đang tải ⇒ chưa phải kết quả hiện hành', () => {
    expect(S({ typed: LONG, debounced: LONG, fetching: true }).current).toBe(false);
  });

  it('có GHIM ⇒ bỏ qua cả ngưỡng lẫn debounce', () => {
    // Ghim làm khoá query đổi ngay, và toạ độ không cần tra chuỗi — xem `deliveryDistance`.
    const s = S({ typed: '', debounced: '', hasPin: true });
    expect(s.queryable).toBe(true);
    expect(s.current).toBe(true);
  });
});
