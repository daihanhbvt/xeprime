import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isAppLocale, resolveAppLocale } from './config';

const cookieStore = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'XP_LOCALE' && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));

const { getServerLocale } = await import('./locale');

/**
 * Cookie là ĐẦU VÀO TỪ CLIENT: nó sửa được bằng devtools, còn sót lại từ bản cũ, hoặc bị một
 * proxy nào đó cắt cụt. Thứ tự phân giải phải rơi về tiếng Việt trong MỌI trường hợp lạ, chứ
 * không được nổ giữa lúc render trang chủ.
 */
describe('getServerLocale', () => {
  it('không có cookie → tiếng Việt (khách lần đầu luôn thấy tiếng Việt)', async () => {
    cookieStore.value = undefined;
    await expect(getServerLocale()).resolves.toBe('vi');
    expect(DEFAULT_LOCALE).toBe('vi');
  });

  it('cookie vi → vi', async () => {
    cookieStore.value = 'vi';
    await expect(getServerLocale()).resolves.toBe('vi');
  });

  it('cookie en → en', async () => {
    cookieStore.value = 'en';
    await expect(getServerLocale()).resolves.toBe('en');
  });

  it.each(['fr', 'EN', '', 'vi-VN', 'en; DROP TABLE', '../../etc/passwd'])(
    'cookie hỏng %j → rơi về tiếng Việt',
    async (value) => {
      cookieStore.value = value;
      await expect(getServerLocale()).resolves.toBe('vi');
    },
  );

  it('KHÔNG đọc Accept-Language ở giai đoạn này — chỉ đúng một nguồn là cookie', () => {
    // Bảo vệ quyết định SEO ở ADR 0012: bot không mang cookie ⇒ HTML công khai luôn tiếng Việt.
    expect(LOCALE_COOKIE_NAME).toBe('XP_LOCALE');
  });
});

describe('resolveAppLocale / isAppLocale', () => {
  it('nhận đúng hai mã, từ chối mọi thứ khác', () => {
    expect(isAppLocale('vi')).toBe(true);
    expect(isAppLocale('en')).toBe(true);
    for (const bad of ['de', 'vi-VN', 'EN', 1, null, undefined, {}, ['vi']]) {
      expect(isAppLocale(bad)).toBe(false);
      expect(resolveAppLocale(bad)).toBe('vi');
    }
  });
});
