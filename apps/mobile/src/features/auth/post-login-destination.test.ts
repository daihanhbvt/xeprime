import type { CurrentUser } from '@/features/auth/api';
import { LOGIN_METHOD, postLoginDestination } from './post-login-destination';

function user(hasPassword: boolean): CurrentUser {
  return {
    id: '01JQZX0000000000000000000A',
    displayName: 'Khách demo',
    email: null,
    avatarUrl: null,
    phone: '0901234567',
    phoneVerified: true,
    hasPassword,
    tenant: null,
    platformRole: null,
    permissions: [],
  };
}

describe('postLoginDestination', () => {
  it('OTP + chưa có mật khẩu ⇒ ghé màn đặt mật khẩu', () => {
    expect(postLoginDestination(user(false), LOGIN_METHOD.OTP)).toBe('/set-password');
  });

  it('OTP + ĐÃ có mật khẩu ⇒ vào thẳng app, không hỏi lại', () => {
    expect(postLoginDestination(user(true), LOGIN_METHOD.OTP)).toBeNull();
  });

  it('Google/Facebook ⇒ vào thẳng app DÙ chưa có mật khẩu', () => {
    /*
     * Đây là lệch thật đã xảy ra: bản trước chỉ kiểm `hasPassword`, mà tài khoản tạo từ Google
     * cũng không có mật khẩu — nên họ bị hỏi, trong khi web không hỏi. Họ sẽ bấm Google ở mọi
     * lần sau, nên mật khẩu đó không tiết kiệm cho họ thao tác nào.
     */
    expect(postLoginDestination(user(false), LOGIN_METHOD.SOCIAL)).toBeNull();
  });

  it('mật khẩu ⇒ vào thẳng app', () => {
    expect(postLoginDestination(user(true), LOGIN_METHOD.PASSWORD)).toBeNull();
  });
});
