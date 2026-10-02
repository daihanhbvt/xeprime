import { mixHex } from './color-mix';

/**
 * Đối chiếu với chính `color-mix(in srgb, …)` của trình duyệt.
 *
 * Bốn giá trị dưới đây lấy từ CSS thật của web (`CalendarScheduler.module.css` và
 * `ManageMenu.module.css`) rồi đọc màu đã tính ra ở devtools. Nếu hàm này trôi khỏi công thức
 * của CSS thì app và web ra hai bảng màu khác nhau ở đúng chỗ người dùng mở cả hai lên đối chiếu.
 */
describe('mixHex', () => {
  it('trộn đúng như `color-mix(in srgb, a <ratio>%, b)`', () => {
    // --xp-cal-zebra-bg: color-mix(in srgb, #f5f3ef 45%, #ffffff)
    expect(mixHex('#f5f3ef', '#ffffff', 0.45)).toBe('#fbfaf8');
    // --xp-cal-weekend-bg: color-mix(in srgb, #f5f3ef 60%, #ffffff)
    expect(mixHex('#f5f3ef', '#ffffff', 0.6)).toBe('#f9f8f5');
    // --xp-cal-holiday-bg: color-mix(in srgb, #dc2626 8%, #ffffff)
    expect(mixHex('#dc2626', '#ffffff', 0.08)).toBe('#fceeee');
    // Viền thanh event: color-mix(in srgb, #2563eb 35%, #eff6ff)
    expect(mixHex('#2563eb', '#eff6ff', 0.35)).toBe('#a8c3f8');
  });

  it('hai đầu mút trả về đúng màu gốc', () => {
    expect(mixHex('#dc2626', '#ffffff', 1)).toBe('#dc2626');
    expect(mixHex('#dc2626', '#ffffff', 0)).toBe('#ffffff');
  });

  /*
   * Ném thay vì trả về `#NaNNaNNaN`: React Native BỎ QUA im lặng một chuỗi màu không hợp lệ, để
   * lại một nền trong suốt mà không có gì trong log chỉ ra nguồn.
   */
  it('từ chối màu không phải `#rrggbb`', () => {
    expect(() => mixHex('rgb(220, 38, 38)', '#ffffff', 0.5)).toThrow();
    expect(() => mixHex('#fff', '#ffffff', 0.5)).toThrow();
    expect(() => mixHex('#dc2626', '#ffffff', 1.5)).toThrow();
  });
});
