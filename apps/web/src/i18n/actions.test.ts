import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_COOKIE_MAX_AGE } from './config';

const store = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('next/headers', () => ({ cookies: async () => store }));

const { setLocale } = await import('./actions');

beforeEach(() => {
  store.set.mockClear();
});

/**
 * Server Action là một endpoint POST CÔNG KHAI: mọi thứ nó nhận đến từ Internet.
 *
 * Ba điều được khoá ở đây, vì mỗi điều là một lỗ hổng nếu trượt:
 *   - chỉ nhận đúng hai mã ngôn ngữ (kiểu TypeScript bị xoá lúc chạy, nên phải kiểm tra thật);
 *   - chỉ ghi ĐÚNG cookie `XP_LOCALE`, không nhận tên cookie từ bên gọi;
 *   - không nhận đích chuyển hướng ⇒ không có đường nào thành open redirect.
 */
describe('setLocale', () => {
  it('ghi cookie XP_LOCALE với đủ thuộc tính bắt buộc', async () => {
    await expect(setLocale('en')).resolves.toEqual({ ok: true, locale: 'en' });

    expect(store.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = store.set.mock.calls[0]!;
    expect(name).toBe('XP_LOCALE');
    expect(value).toBe('en');
    expect(options).toMatchObject({
      path: '/',
      sameSite: 'lax',
      maxAge: LOCALE_COOKIE_MAX_AGE,
      httpOnly: true,
    });
    expect(LOCALE_COOKIE_MAX_AGE).toBe(31_536_000);
  });

  it('secure bám môi trường — bật ở production, tắt ở dev (http://localhost)', async () => {
    await setLocale('vi');
    const [, , options] = store.set.mock.calls[0]!;
    expect(options.secure).toBe(process.env.NODE_ENV === 'production');
  });

  it.each(['fr', 'EN', '', 'vi vi', null, undefined, 42, { locale: 'en' }])(
    'từ chối %j và KHÔNG ghi cookie nào',
    async (bad) => {
      await expect(setLocale(bad as never)).resolves.toEqual({ ok: false, locale: null });
      expect(store.set).not.toHaveBeenCalled();
    },
  );

  it('chỉ nhận MỘT tham số — không có tên cookie, không có đích chuyển hướng', () => {
    // `length` = số tham số khai báo. Thêm tham số thứ hai là mở đúng cửa mà test này canh.
    expect(setLocale.length).toBe(1);
  });
});
