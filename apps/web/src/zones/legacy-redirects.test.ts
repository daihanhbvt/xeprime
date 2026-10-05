import { describe, expect, it } from 'vitest';
import {
  legacyOwnerPageTarget,
  legacyPartnerPageTarget,
  legacyPrefixedTarget,
} from './legacy-redirects';
import { ZONE } from './zone-config';

/**
 * Bảng URL cũ (B2 — ADR 0051 điều 3). Bookmark, email và thông báo đã phát còn trỏ vào đây; một
 * dòng sai là một link chết hoặc — tệ hơn — trang của KHÁCH bị đá sang site đối tác.
 */
describe('legacyOwnerPageTarget — Owner Lite cũ trên site khách → site partner', () => {
  const cases: Array<[string, string]> = [
    ['/account/registration', '/registration'],
    ['/account/vehicles', '/vehicles'],
    ['/account/vehicles/', '/vehicles'],
    ['/account/vehicles/01VEH', '/vehicles/01VEH'],
    ['/account/vehicles/01VEH/manage', '/vehicles/01VEH/manage'],
    ['/account/vehicles/01VEH/manage/pricing', '/vehicles/01VEH/manage/pricing'],
    ['/account/calendar', '/calendar'],
    ['/account/earnings', '/balance'],
    ['/account/subscription', '/subscription'],
    ['/account/host-guide', '/host-guide'],
    ['/account/tax', '/tax'],
    ['/account/contracts-documents', '/contracts-documents'],
    ['/account/data-protection', '/data-protection'],
    ['/account/messages', '/chat'],
    ['/list-your-vehicle/register', '/vehicles/register'],
    ['/invites/tok_123', '/invites/tok_123'],
  ];

  it.each(cases)('%s → partner %s', (from, to) => {
    expect(legacyOwnerPageTarget(from)).toEqual({ zone: ZONE.PARTNER, path: to });
  });

  it('trang của KHÁCH trong /account/** ở lại site khách', () => {
    for (const path of [
      '/account',
      '/account/balance',
      '/account/payments',
      '/account/bank-accounts',
      '/account/change-password',
      '/account/delete-account',
      '/account/favorites',
      '/account/addresses',
      '/account/documents',
      '/account/notifications',
      '/account/support',
      '/account/settings',
      '/list-your-vehicle',
      '/trips',
      '/chat',
    ]) {
      expect(legacyOwnerPageTarget(path), path).toBeNull();
    }
  });

  it('không ăn sang đoạn kế tiếp hay tiền tố trùng chữ', () => {
    expect(legacyOwnerPageTarget('/account/vehicles-old')).toBeNull();
    expect(legacyOwnerPageTarget('/account/earnings/2026')).toBeNull();
    expect(legacyOwnerPageTarget('/invites/a/b')).toBeNull();
  });
});

describe('legacyPrefixedTarget — URL mang tiền tố nội bộ cũ', () => {
  it('/manage/admin/* là khu quản trị cũ', () => {
    expect(legacyPrefixedTarget('/manage/admin')).toEqual({ zone: ZONE.ADMIN, path: '/' });
    expect(legacyPrefixedTarget('/manage/admin/tenants/01T')).toEqual({
      zone: ZONE.ADMIN,
      path: '/tenants/01T',
    });
  });

  it('/manage/* là cổng quản lý, nay là site partner', () => {
    expect(legacyPrefixedTarget('/manage')).toEqual({ zone: ZONE.PARTNER, path: '/' });
    expect(legacyPrefixedTarget('/manage/vehicles')).toEqual({
      zone: ZONE.PARTNER,
      path: '/vehicles',
    });
    expect(legacyPrefixedTarget('/manage/administrators')).toEqual({
      zone: ZONE.PARTNER,
      path: '/administrators',
    });
  });

  it('/manage/account/trips cũ đi thẳng sang site khách', () => {
    expect(legacyPrefixedTarget('/manage/account/trips')).toEqual({ zone: ZONE.MARKET, path: '/trips' });
    expect(legacyPrefixedTarget('/manage/account/trips/01T')).toEqual({
      zone: ZONE.MARKET,
      path: '/trips/01T',
    });
    // Hồ sơ cá nhân partner `/manage/account` là trang thật của site partner.
    expect(legacyPrefixedTarget('/manage/account')).toEqual({ zone: ZONE.PARTNER, path: '/account' });
  });

  it('không mang tiền tố /manage → null', () => {
    expect(legacyPrefixedTarget('/managed')).toBeNull();
    expect(legacyPrefixedTarget('/admin/tenants')).toBeNull();
    expect(legacyPrefixedTarget('/')).toBeNull();
  });
});

describe('legacyPartnerPageTarget — trang partner đã sang site khách', () => {
  it('chuyến đi thuê → /trips', () => {
    expect(legacyPartnerPageTarget('/account/trips')).toEqual({ zone: ZONE.MARKET, path: '/trips' });
    expect(legacyPartnerPageTarget('/account/trips/01T/')).toEqual({
      zone: ZONE.MARKET,
      path: '/trips/01T',
    });
    expect(legacyPartnerPageTarget('/account')).toBeNull();
    expect(legacyPartnerPageTarget('/bookings')).toBeNull();
  });
});
