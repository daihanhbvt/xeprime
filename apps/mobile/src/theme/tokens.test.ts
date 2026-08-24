import { XP_TOKENS } from '@xeprime/ui';
import { elevation } from './elevation';
import { colors, fontSize, fontWeight, radius, sizing, space } from './tokens';

/**
 * Token của hệ thiết kế viết bằng ngôn ngữ CSS; native đọc lại chúng qua hai bộ chuyển đổi
 * (`tokens.ts` gỡ bí danh `var()`, `elevation.ts` tách box-shadow). Cả hai chỉ chạy LÚC nạp
 * module trên thiết bị — sai một dạng giá trị là màn hình trắng kèm log đỏ, không phải test đỏ.
 *
 * Bộ test này là hàng rào: đổi/thêm token ở `@xeprime/ui` mà dạng giá trị lệch thì hỏng ở đây
 * trước, không phải trên máy người dùng. (Đã xảy ra: parser đòi `px` ở mọi số, còn token viết
 * offset `0` trần.)
 */
describe('màu native lấy từ token dùng chung', () => {
  it.each(Object.entries(colors))('%s là màu native dùng được', (_name, value) => {
    expect(value).toMatch(/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i);
  });

  it('primary đúng bằng gold của hệ, không phải bảng màu tự chế', () => {
    expect(colors.primary).toBe(XP_TOKENS['color-primary']);
    expect(colors.onPrimary).toBe(XP_TOKENS['color-primary-contrast']);
  });
});

describe('kích thước native lấy từ token dùng chung', () => {
  const scales = { space, radius, fontSize, sizing };

  it.each(Object.entries(scales))('%s toàn số hữu hạn dương', (_name, scale) => {
    // Gom thành bảng rồi so một lần: `toBe(true)` trong vòng lặp chỉ báo "false ≠ true",
    // không nói khoá nào hỏng. Jest không nhận message ở `expect` như Vitest.
    const bad = Object.entries(scale).filter(
      ([, value]) => !Number.isFinite(value) || value <= 0,
    );
    expect(bad).toEqual([]);
  });

  it('fontWeight là chuỗi — RN không nhận số ở đây', () => {
    for (const value of Object.values(fontWeight)) {
      expect(typeof value).toBe('string');
    }
  });

  it('vùng chạm đạt sàn 48dp của Android', () => {
    expect(sizing.touchTarget).toBeGreaterThanOrEqual(48);
  });
});

describe('bóng đổ', () => {
  it.each(Object.entries(elevation))('%s parse được cho cả hai nền tảng', (_name, style) => {
    // jest-expo chạy ở `Platform.OS = 'ios'`, nên đây là nhánh box-shadow đã parse.
    expect(style.shadowColor).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(Number.isFinite(style.shadowRadius)).toBe(true);
    expect(style.shadowOpacity).toBeGreaterThan(0);
    expect(style.shadowOpacity).toBeLessThanOrEqual(1);
  });

  it('bóng của card khớp đúng token của web', () => {
    expect(elevation.card.shadowOffset).toEqual({ width: 0, height: 2 });
    // CSS blur là đường kính, `shadowRadius` của iOS là bán kính.
    expect(elevation.card.shadowRadius).toBe(2);
    expect(elevation.card.shadowOpacity).toBeCloseTo(0.06);
  });
});
