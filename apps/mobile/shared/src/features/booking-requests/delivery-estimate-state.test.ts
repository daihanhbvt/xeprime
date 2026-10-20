import { deliveryEstimateState } from './delivery-estimate-state';

const S = (over: Partial<Parameters<typeof deliveryEstimateState>[0]> = {}) =>
  deliveryEstimateState({
    typed: '',
    debounced: '',
    hasPin: false,
    manual: true,
    fetching: false,
    ...over,
  });

const LONG = '12 Lê Lợi, Quận 1'; // 17 ký tự
const SHORT = '12 Lê Lợi'; // 9 ký tự

describe('deliveryEstimateState', () => {
  it('địa chỉ còn ngắn ⇒ không hỏi, và KHÔNG treo spinner', () => {
    const s = S({ typed: SHORT, debounced: SHORT });
    expect(s.queryable).toBe(false);
    expect(s.askable).toBe(false);
  });

  it('LỆCH MỘT NHỊP: gõ tới ký tự thứ 12 nhưng debounce còn giữ chuỗi 11 ⇒ CHƯA gửi', () => {
    const s = S({ typed: LONG, debounced: SHORT });
    expect(s.queryable).toBe(false);
    // Giao diện vẫn phải nói "đang tính" — im lặng suốt quãng debounce đọc ra như app đơ.
    expect(s.askable).toBe(true);
    expect(s.current).toBe(false);
  });

  it('debounce đã bắt kịp ⇒ hỏi, và kết quả được coi là của địa chỉ đang hiện', () => {
    const s = S({ typed: LONG, debounced: LONG });
    expect(s.queryable).toBe(true);
    expect(s.current).toBe(true);
  });

  it('SỬA địa chỉ sau khi đã có kết quả ⇒ kết quả cũ hết hiệu lực ngay', () => {
    const s = S({ typed: LONG + ' B', debounced: LONG });
    expect(s.settled).toBe(false);
    expect(s.current).toBe(false);
  });

  it('đang tải ⇒ chưa phải kết quả hiện hành', () => {
    expect(S({ typed: LONG, debounced: LONG, fetching: true }).current).toBe(false);
  });

  it('có GHIM ⇒ bỏ qua cả ngưỡng, debounce lẫn nguồn', () => {
    const s = S({ typed: '', debounced: '', hasPin: true, manual: false });
    expect(s.queryable).toBe(true);
    expect(s.current).toBe(true);
  });

  it('CHỮ CHƯA CHỐT (nguồn khác manual, không ghim) ⇒ không hỏi, không spinner — y như web', () => {
    // Tra một dòng chữ chưa xác nhận là hai giao dịch Vietmap có tính tiền (ADR 0061).
    const s = S({ typed: LONG, debounced: LONG, manual: false });
    expect(s.queryable).toBe(false);
    expect(s.askable).toBe(false);
    expect(s.current).toBe(false);
  });

  it('vừa CHỐT manual trong khi debounce còn chuỗi gõ dở ⇒ chưa gửi chuỗi đó', () => {
    // Nguồn đổi ngay, chuỗi debounce chưa bắt kịp — gửi lúc này là tra chuỗi không ai xác nhận.
    const s = S({ typed: LONG, debounced: LONG.slice(0, 14) });
    expect(s.queryable).toBe(false);
    expect(s.askable).toBe(true);
  });
});
