import { APP_SCOPE } from '@/features/shell/app-scope';
import { notificationHref } from '@/features/notifications/deep-link';
import { resolveInitialScope, scopeHome } from './app-profile';

/** App XePrime (Customer) chỉ có MỘT khu — mọi tài khoản đều hạ cánh ở khu khách. */
describe('app-profile (customer)', () => {
  it('luôn hạ cánh ở khu KHÁCH — kể cả gian hàng tuyến gói và lựa chọn manage đã nhớ', () => {
    expect(resolveInitialScope({ user: null })).toBe(APP_SCOPE.CUSTOMER);
    expect(
      resolveInitialScope({ user: { platformRole: 'platform_admin' }, remembered: APP_SCOPE.MANAGE }),
    ).toBe(APP_SCOPE.CUSTOMER);
  });

  it('khu MANAGE đổ về màn handoff /partner, không phải một route quản lý', () => {
    expect(scopeHome(APP_SCOPE.MANAGE)).toBe('/partner');
    expect(scopeHome(APP_SCOPE.CUSTOMER)).toBe('/explore');
  });
});

describe('allowlist thông báo (customer)', () => {
  it('nhận đích khách + Owner Lite', () => {
    expect(notificationHref('/trips')).not.toBeNull();
    expect(notificationHref('/trips/01J00000000000000000000A')).not.toBeNull();
    expect(notificationHref('/account/vehicles')).not.toBeNull();
    expect(notificationHref('/listings/01J00000000000000000000A')).not.toBeNull();
  });

  it('TỪ CHỐI đích /manage/** — audience đó thuộc app XePrime Partner', () => {
    expect(notificationHref('/manage/requests')).toBeNull();
    expect(notificationHref('/manage/bookings/01J00000000000000000000A')).toBeNull();
    expect(notificationHref('/manage/shop')).toBeNull();
  });
});
