import { APP_SCOPE } from '@/features/shell/app-scope';
import { notificationHref } from '@/features/notifications/deep-link';
import { resolveInitialScope, scopeHome } from './app-profile';

/** App XePrime Partner chỉ có khu QUẢN LÝ — server đã gác cổng đăng nhập theo eligibility. */
describe('app-profile (partner)', () => {
  it('luôn hạ cánh ở khu QUẢN LÝ — lựa chọn customer đã nhớ không có nghĩa ở app này', () => {
    expect(resolveInitialScope({ user: null })).toBe(APP_SCOPE.MANAGE);
    expect(resolveInitialScope({ user: {}, remembered: APP_SCOPE.CUSTOMER })).toBe(
      APP_SCOPE.MANAGE,
    );
  });

  it('còn nợ bước thanh toán gói ⇒ màn onboarding; khu CUSTOMER ⇒ màn giải thích', () => {
    expect(scopeHome(APP_SCOPE.MANAGE, true)).toBe('/manage/onboarding');
    expect(scopeHome(APP_SCOPE.MANAGE, false)).toBe('/manage');
    expect(scopeHome(APP_SCOPE.CUSTOMER)).toBe('/not-eligible');
  });
});

describe('allowlist thông báo (partner)', () => {
  it('nhận đích /manage/**', () => {
    expect(notificationHref('/manage/requests')).not.toBeNull();
    expect(notificationHref('/manage/bookings/01J00000000000000000000A')).not.toBeNull();
    expect(notificationHref('/manage/chat/01J00000000000000000000A')).not.toBeNull();
  });

  it('TỪ CHỐI đích khách/Owner Lite — audience đó thuộc app XePrime', () => {
    expect(notificationHref('/trips')).toBeNull();
    expect(notificationHref('/account')).toBeNull();
    expect(notificationHref('/listings/01J00000000000000000000A')).toBeNull();
  });
});
