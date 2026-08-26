import { describe, expect, it, vi } from 'vitest';
import { AUTH_PROVIDER } from '@xeprime/types';
import { nextWithoutAuthParams, socialAuthUrl } from './social-auth-url';

vi.mock('@/services/api-client', () => ({
  getApiBaseUrl: () => 'https://api.xeprime.vn/',
}));

/**
 * Đăng nhập mạng xã hội chuyển hướng CẢ TAB sang backend (ADR 0019), nên URL dựng ở đây là toàn
 * bộ phần web tham gia vào luồng. Sai nó là hoặc không đăng nhập được, hoặc quay về sai chỗ.
 */
describe('socialAuthUrl', () => {
  it('trỏ đúng endpoint của backend và kèm locale', () => {
    const url = new URL(socialAuthUrl(AUTH_PROVIDER.GOOGLE, { next: '/trips', locale: 'en' }));

    expect(url.origin + url.pathname).toBe('https://api.xeprime.vn/auth/social/google');
    expect(url.searchParams.get('next')).toBe('/trips');
    expect(url.searchParams.get('locale')).toBe('en');
  });

  it('bỏ `next` không an toàn thay vì gửi đi', () => {
    const url = new URL(
      socialAuthUrl(AUTH_PROVIDER.FACEBOOK, { next: 'https://evil.example', locale: 'vi' }),
    );

    expect(url.pathname).toBe('/auth/social/facebook');
    expect(url.searchParams.has('next')).toBe(false);
  });

  it('`next` rỗng thì không gửi tham số thừa', () => {
    const url = new URL(socialAuthUrl(AUTH_PROVIDER.GOOGLE, { next: null, locale: 'vi' }));
    expect(url.searchParams.has('next')).toBe(false);
  });
});

/**
 * Cái bẫy của việc bỏ popup: lúc bấm nút, URL đang mang `?auth=login`. Giữ nguyên nó làm `next`
 * thì đăng nhập xong hộp đăng nhập mở lại ngay trước mặt người vừa đăng nhập thành công.
 */
describe('nextWithoutAuthParams', () => {
  it('bỏ auth/next/authError nhưng giữ nguyên query của trang', () => {
    expect(nextWithoutAuthParams('/xe/01H', '?auth=login&next=%2Ftrips&from=home')).toBe(
      '/xe/01H?from=home',
    );
  });

  it('bỏ cả `authError` — lỗi cũ không được mang sang lần thử mới', () => {
    expect(nextWithoutAuthParams('/', '?auth=login&authError=SOCIAL_CANCELLED')).toBe('/');
  });

  it('không còn query thì trả pathname trần', () => {
    expect(nextWithoutAuthParams('/trips', '')).toBe('/trips');
  });
});
