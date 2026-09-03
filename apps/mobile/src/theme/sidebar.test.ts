import { sidebar } from './tokens';

/**
 * Bốn màu dẫn xuất của sidebar được TÍNH SẴN thành hex (React Native không có `color-mix`).
 *
 * Test này là thứ giữ chúng khỏi trôi: nó tính lại đúng công thức của web từ ba màu gốc và
 * đối chiếu, rồi đo lại tương phản. Đổi `shell-sidebar-bg`/`-text`/`-active` ở `@xeprime/ui`
 * mà quên cập nhật bảng native thì test đỏ, thay vì một tấm menu chữ mờ trên máy thật.
 */
type Rgb = readonly [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** `color-mix(in srgb, <a> <ratio>%, <b>)` — trộn tuyến tính trong không gian sRGB. */
function mix(a: string, b: string, ratio: number): string {
  const [ra, ga, ba] = toRgb(a);
  const [rb, gb, bb] = toRgb(b);
  const channel = (x: number, y: number) => Math.round(x * ratio + y * (1 - ratio));
  return `#${[channel(ra, rb), channel(ga, gb), channel(ba, bb)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function luminance(hex: string): number {
  const linear = toRgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('bảng màu sidebar khu quản lý', () => {
  it('ba màu gốc đến từ token dùng chung, không phải hex viết tay', () => {
    expect(sidebar.bg).toBe('#1e1b16');
    expect(sidebar.text).toBe('#e8e4dd');
    expect(sidebar.active).toBe('#d6a02c');
  });

  it('bốn màu dẫn xuất khớp đúng công thức `color-mix` của web', () => {
    expect(sidebar.hover).toBe(mix(sidebar.text, sidebar.bg, 0.08));
    expect(sidebar.selectedBg).toBe(mix(sidebar.active, sidebar.bg, 0.14));
    expect(sidebar.muted).toBe(mix(sidebar.text, sidebar.bg, 0.62));
    expect(sidebar.border).toBe(mix(sidebar.text, sidebar.bg, 0.14));
  });

  /*
   * Ngưỡng lấy từ chính con số web đã đo và ghi trong `ManageMenu.module.css`. Chữ mờ là chỗ
   * suýt trượt nhất (5.96) nên nó là mục đáng canh nhất ở đây.
   */
  it('chữ trên nền tối đạt AA', () => {
    expect(contrast(sidebar.text, sidebar.bg)).toBeGreaterThanOrEqual(13.5);
    expect(contrast(sidebar.muted, sidebar.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(sidebar.text, sidebar.selectedBg)).toBeGreaterThanOrEqual(10.5);
    expect(contrast(sidebar.active, sidebar.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
