import { nextFooterLift } from './Screen';

/**
 * Bù phần bàn phím che thanh `footer`.
 *
 * `KeyboardAvoidingView` dựng phần đệm từ `endCoordinates.screenY`, và trên Android edge-to-edge
 * con số đó tính hụt phần thật sự phủ lên màn — bàn phím Samsung còn một dải công cụ riêng nằm
 * trên bàn phím. Phần hụt ăn thẳng vào ô nhập của thanh soạn tin.
 *
 * Phần ĐO (`measureInWindow`, sự kiện bàn phím) chỉ chạy thật trên máy. Ba luật số học dưới đây
 * thì không cần máy nào, và chúng là thứ quyết định vòng đo có hội tụ hay chạy loạn.
 */
describe('nextFooterLift', () => {
  it('KHÔNG bị che thì đứng yên ở 0 — màn nào vốn đã đúng không bị đẩy thêm pixel nào', () => {
    expect(nextFooterLift(0, -40)).toBe(0);
    expect(nextFooterLift(0, 0)).toBe(0);
  });

  /** Lệch dưới 1dp là phần lẻ của phép đo, không phải bị che. Nâng theo nó là rung vĩnh viễn. */
  it('lệch dưới ngưỡng thì bỏ qua', () => {
    expect(nextFooterLift(12, 0.4)).toBe(12);
    expect(nextFooterLift(12, 1)).toBe(12);
  });

  it('bị che thì nâng ĐÚNG bằng phần che', () => {
    expect(nextFooterLift(0, 28)).toBe(28);
  });

  /** Vòng "đo → nâng → đo lại": phần chênh còn lại cộng dồn vào giá trị đang có. */
  it('cộng dồn qua từng vòng đo', () => {
    expect(nextFooterLift(28, 6)).toBe(34);
  });

  /**
   * Hình dạng bàn phím/thanh soạn tin đổi trong lúc bàn phím vẫn mở (đính kèm ảnh, dải công cụ
   * của bàn phím bật/tắt) thì phần nâng lần trước thành DƯ — phải trả lại được, không thì dải
   * trống đó nằm lại giữa ô nhập và bàn phím.
   */
  it('nâng dư thì hạ bớt, và không hạ xuống dưới 0', () => {
    expect(nextFooterLift(48, -20)).toBe(28);
    expect(nextFooterLift(30, -200)).toBe(0);
  });

  /** Một phép đo bất thường (khung đang chuyển động) không được đẩy cả thanh ra khỏi màn. */
  it('có TRẦN chặn đo sai', () => {
    expect(nextFooterLift(0, 10_000)).toBe(160);
    expect(nextFooterLift(150, 100)).toBe(160);
  });

  it('giá trị vô nghĩa thì giữ nguyên, không trả NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(nextFooterLift(20, bad)).toBe(20);
    }
  });
});
