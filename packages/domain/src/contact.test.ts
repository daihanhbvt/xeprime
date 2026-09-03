import { describe, expect, it } from 'vitest';

import { telHref, zaloHref } from './contact';

/**
 * Dữ liệu thật mang cả ba dạng: `0…` (khách gõ ở form), `+84…` (đăng nhập bằng SĐT quốc tế) và
 * `84…` (dạng chuẩn hoá lưu trên `users.phone`). Cả ba phải ra CÙNG một link, nếu không nút Gọi
 * và nút Zalo im lặng dẫn sai chỗ tuỳ hồ sơ khách được tạo bằng đường nào.
 */
describe('telHref / zaloHref', () => {
  it('mọi dạng SĐT Việt Nam quy về một link gọi', () => {
    expect(telHref('0901234567')).toBe('tel:0901234567');
    expect(telHref('+84901234567')).toBe('tel:0901234567');
    expect(telHref('84901234567')).toBe('tel:0901234567');
  });

  it('bỏ khoảng trắng và dấu phân cách người dùng gõ', () => {
    expect(telHref('090 123 4567')).toBe('tel:0901234567');
    expect(telHref('090-123-4567')).toBe('tel:0901234567');
  });

  it('Zalo định danh bằng SĐT NỘI ĐỊA — `+84` mở ra trang tìm kiếm rỗng', () => {
    expect(zaloHref('0901234567')).toBe('https://zalo.me/0901234567');
    expect(zaloHref('+84901234567')).toBe('https://zalo.me/0901234567');
  });

  it('thiếu số → null để chỗ gọi hiện CHỮ thay vì một link chết', () => {
    expect(telHref(null)).toBeNull();
    expect(telHref(undefined)).toBeNull();
    expect(telHref('')).toBeNull();
    expect(zaloHref(null)).toBeNull();
    expect(zaloHref('   ')).toBeNull();
  });
});
