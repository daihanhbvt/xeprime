import { describe, expect, it } from 'vitest';

import { ROUTES, adminTenantSupportPath, bookingPath, customerPath, vehiclePath } from './routes';
import { tenantSupportHref, toTenantSupportRoute } from './tenant-support-routes';

/**
 * Bảng ánh xạ route của khu làm việc gian hàng → route của phiên hỗ trợ (ADR 0050 §12).
 *
 * Đây là thứ giữ một link trong card/bảng/dialog của trang dùng lại không "thoát" khỏi phiên —
 * thoát ra `/manage/...` là mất header phiên, và request đi bằng tài khoản nhân sự.
 */
const CTX = 'A1B2C3D4E5F6G7H8J9K0M1N2P3';
const OTHER = 'Z9Y8X7W6V5T4S3R2Q1P0N9M8K7';
const base = adminTenantSupportPath.root(CTX);

describe('toTenantSupportRoute', () => {
  it.each([
    [ROUTES.MANAGE.ROOT, `${base}/dashboard`],
    [ROUTES.MANAGE.VEHICLES, `${base}/vehicles`],
    [vehiclePath.detail('v1'), `${base}/vehicles/v1`],
    [ROUTES.MANAGE.CALENDAR, `${base}/calendar`],
    [ROUTES.MANAGE.BOOKING_REQUESTS, `${base}/booking-requests`],
    [ROUTES.MANAGE.BOOKINGS, `${base}/bookings`],
    [bookingPath.detail('b1'), `${base}/bookings/b1`],
    [customerPath.detail('c1'), `${base}/customers/c1`],
    [ROUTES.MANAGE.SHOP, `${base}/shop`],
    // Owner Lite
    [ROUTES.ACCOUNT.VEHICLES, `${base}/vehicles`],
    [`${ROUTES.ACCOUNT.VEHICLES}/v1/manage/images`, `${base}/vehicles/v1/manage/images`],
    [ROUTES.ACCOUNT.CALENDAR, `${base}/calendar`],
    [ROUTES.ACCOUNT.SUPPORT, `${base}/support/cases`],
  ])('%s → trang của phiên', (href, expected) => {
    expect(toTenantSupportRoute(CTX, href)).toEqual({ kind: 'mapped', href: expected });
  });

  it('giữ query/hash (bộ lọc trên URL — ADR 0004)', () => {
    expect(toTenantSupportRoute(CTX, `${ROUTES.MANAGE.BOOKINGS}?status=active#top`)).toEqual({
      kind: 'mapped',
      href: `${base}/bookings?status=active#top`,
    });
  });

  it.each([
    ['/manage/finance'],
    ['/manage/wallet'],
    ['/manage/debts'],
    ['/manage/contracts/x1'],
    ['/manage/billing'],
    ['/manage/vehicles/v1/pricing'],
    [ROUTES.ACCOUNT.ROOT],
    ['/account/wallet'],
    ['/account/security'],
    ['/account/profile'],
    [ROUTES.TRIPS],
    ['/trips/t1'],
    ['/chat'],
    ['/chat/th1'],
  ])('%s — khu không mở trong phiên: chặn, không điều hướng', (href) => {
    expect(toTenantSupportRoute(CTX, href)).toEqual({ kind: 'blocked' });
  });

  it('link sang phiên KHÁC bị chặn — không nhảy phiên', () => {
    expect(toTenantSupportRoute(CTX, `${adminTenantSupportPath.root(OTHER)}/vehicles`)).toEqual({
      kind: 'blocked',
    });
  });

  it('link trong CHÍNH phiên giữ nguyên', () => {
    expect(toTenantSupportRoute(CTX, `${base}/vehicles`)).toEqual({
      kind: 'mapped',
      href: `${base}/vehicles`,
    });
  });

  it.each([
    [ROUTES.MANAGE.ADMIN_TENANTS],
    [ROUTES.MANAGE.ADMIN],
    // Tài khoản của CHÍNH nhân sự đang đăng nhập (thẻ người dùng ở menu).
    [ROUTES.MANAGE.SECURITY],
    [ROUTES.MANAGE.ACCOUNT_TRIPS],
    ['/'],
    ['/listings/l1'],
    ['https://example.com/x'],
    ['mailto:a@b.c'],
    ['//evil.example/x'],
  ])('%s — ngoài khu làm việc: để nguyên (rời phiên có chủ đích)', (href) => {
    expect(toTenantSupportRoute(CTX, href)).toEqual({ kind: 'outside', href });
  });

  it('tenantSupportHref trả null cho route bị chặn', () => {
    expect(tenantSupportHref(CTX, '/manage/finance')).toBeNull();
    expect(tenantSupportHref(CTX, ROUTES.MANAGE.VEHICLES)).toBe(`${base}/vehicles`);
  });
});
