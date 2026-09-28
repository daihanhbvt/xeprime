import type { Href } from 'expo-router';
import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';
import { shopAccountRedirect } from './shop-account-gate';

/**
 * Cổng URL khu khách (ADR 0038 điều 7).
 *
 * Bộ này khoá đúng thứ mà "ẩn menu" không khoá được: BOOKMARK CŨ và THÔNG BÁO ĐẨY CŨ — hai lối
 * vào không đi qua menu, và là cách người dùng thật tìm ra cửa sau chứ không phải ý đồ xấu.
 */
const asPath = (href: Href | null): string | null =>
  href == null ? null : typeof href === 'string' ? href : String(href.pathname);

function user(billingMode: string | null, roleKey: string = TENANT_ROLE.SHOP_OWNER): CurrentUser {
  return { tenant: { roleKey, billingMode } } as unknown as CurrentUser;
}

const shopUser = user(BILLING_MODE.PACKAGE);

describe('shopAccountRedirect', () => {
  it('không phải tuyến gói thì KHÔNG chặn gì cả', () => {
    for (const u of [null, user(BILLING_MODE.COMMISSION), user(null)]) {
      expect(shopAccountRedirect(u, '/account/vehicles')).toBeNull();
      expect(shopAccountRedirect(u, '/trips')).toBeNull();
    }
  });

  it('đường ngoài khu khách thì không đụng tới', () => {
    expect(shopAccountRedirect(shopUser, '/explore')).toBeNull();
    expect(shopAccountRedirect(shopUser, '/manage/bookings')).toBeNull();
    expect(shopAccountRedirect(shopUser, null)).toBeNull();
  });

  /**
   * Deny-by-default: chặn cả nhánh rồi mới chừa ra. Liệt kê trắng từng route thì một màn thêm vào
   * tháng sau lặng lẽ thành lối vào.
   */
  it('mọi công cụ CHO THUÊ của khu khách đều về cổng quản lý', () => {
    for (const p of [
      '/account/vehicles',
      '/account/vehicles/abc',
      '/account/calendar',
      '/account/balance',
      '/account/bank-accounts',
      '/account/tax',
      '/account/subscription',
      '/account/mot-man-nao-do-them-vao-thang-sau',
    ]) {
      expect(asPath(shopAccountRedirect(shopUser, p))).toBe(asPath(ROUTES.manage.home()));
    }
  });

  it('chuyến phía khách đi vào lối CHUYỂN TIẾP; có id thì mở đúng chuyến đó (web /manage/account/trips/[id])', () => {
    expect(asPath(shopAccountRedirect(shopUser, '/trips'))).toBe(
      asPath(ROUTES.manage.accountTrips()),
    );
    expect(shopAccountRedirect(shopUser, '/trips/abc')).toEqual(
      ROUTES.manage.accountTripDetail('abc'),
    );
  });

  /**
   * Khác web đúng ở đây, và có lý do: `/manage/account` bản native là một MỤC LỤC trỏ về chính ba
   * màn này, nên chặn chúng là tạo một vòng lặp chuyển hướng.
   */
  it('ba màn của CON NGƯỜI được cho qua — chúng là đích của lối vào trong khu quản lý', () => {
    for (const p of ['/account', '/account/change-password', '/account/delete-account']) {
      expect(shopAccountRedirect(shopUser, p)).toBeNull();
    }
  });

  /** Câu hỏi hỏi TENANT, không hỏi vai — mọi vai của gian hàng tuyến gói bị chặn như nhau. */
  it('mọi vai của gian hàng tuyến gói đều bị chặn như nhau', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_OWNER,
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const u = user(BILLING_MODE.PACKAGE, roleKey);
      expect(asPath(shopAccountRedirect(u, '/account/vehicles'))).toBe(
        asPath(ROUTES.manage.home()),
      );
    }
  });
});
