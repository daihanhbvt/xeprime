import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readRememberedProvince,
  rememberProvince,
  rememberedProvinceSnapshot,
} from './province-memory';

/**
 * Tỉnh đã chọn, nhớ giữa các màn hình và qua F5.
 *
 * Bốn điều test này khoá:
 *   1. Ghi rồi đọc lại được — điều kiện tối thiểu, và là thứ khiến ô địa chỉ tự điền.
 *   2. "Toàn quốc" (mã rỗng) XOÁ bộ nhớ. Giữ lại nghĩa là khách vừa nói "xem cả nước" mà màn sau
 *      vẫn điền Bắc Ninh cho họ.
 *   3. Mã ngoài danh mục hiện hành bị bỏ — một mã của danh mục TRƯỚC 01/07/2025 còn nằm trong
 *      trình duyệt của khách cũ sẽ điền vào bộ chọn một giá trị không có trong danh sách.
 *   4. Lựa chọn quá cũ hết hiệu lực; và `localStorage` hỏng không được làm gãy gì.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('province-memory', () => {
  it('ghi rồi đọc lại đúng mã', () => {
    rememberProvince('24');
    expect(readRememberedProvince()).toBe('24');
    // Ảnh chụp cho `useSyncExternalStore` phải nói cùng một điều.
    expect(rememberedProvinceSnapshot()).toBe('24');
  });

  it('mã rỗng ("Toàn quốc") xoá bộ nhớ thay vì giữ lựa chọn cũ', () => {
    rememberProvince('24');
    rememberProvince('');
    expect(readRememberedProvince()).toBeNull();
  });

  it('mã ngoài danh mục hiện hành không được ghi, và không được đọc ra', () => {
    rememberProvince('99');
    expect(readRememberedProvince()).toBeNull();

    // Kể cả khi nó đã nằm sẵn trong trình duyệt từ một bản cũ.
    window.localStorage.setItem(
      'xp.provinceCode',
      JSON.stringify({ provinceCode: '99', savedAt: new Date().toISOString() }),
    );
    expect(readRememberedProvince()).toBeNull();
  });

  it('lựa chọn quá cũ thì bỏ', () => {
    window.localStorage.setItem(
      'xp.provinceCode',
      JSON.stringify({
        provinceCode: '24',
        savedAt: new Date(Date.now() - 181 * DAY_MS).toISOString(),
      }),
    );
    expect(readRememberedProvince()).toBeNull();
  });

  it('dữ liệu hỏng không làm gãy gì', () => {
    window.localStorage.setItem('xp.provinceCode', 'không-phải-json');
    expect(readRememberedProvince()).toBeNull();
  });
});
