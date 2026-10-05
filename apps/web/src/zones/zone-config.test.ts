import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ZONE,
  ZONE_MODE,
  crossZoneHref,
  internalPathOf,
  isPathInZone,
  isSafeTarget,
  partnerPathFromApi,
  siteHref,
  zoneBase,
  zoneForHost,
  zoneHref,
  zoneMode,
  zoneOfInternalPath,
  zonePath,
  zoneRelativePath,
} from './zone-config';

/**
 * Bộ dựng đường dẫn ba site (ADR 0051 điều 2). Mọi hàm nhận `mode` tường minh nên test được cả hai
 * chế độ mà không nạp lại module; URL các site đọc env lúc GỌI nên `vi.stubEnv` là đủ.
 */
const { HOST, PATH } = ZONE_MODE;

function stubHostSites() {
  vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'https://xeprime.vn/');
  vi.stubEnv('NEXT_PUBLIC_WEB_PARTNER_URL', 'https://partner.xeprime.vn');
  vi.stubEnv('NEXT_PUBLIC_WEB_ADMIN_URL', 'https://admin.xeprime.vn');
}

function stubPathSites() {
  vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'http://localhost:3000');
  vi.stubEnv('NEXT_PUBLIC_WEB_PARTNER_URL', 'http://localhost:3000/manage');
  vi.stubEnv('NEXT_PUBLIC_WEB_ADMIN_URL', 'http://localhost:3000/admin');
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', '');
  vi.stubEnv('NEXT_PUBLIC_WEB_PARTNER_URL', '');
  vi.stubEnv('NEXT_PUBLIC_WEB_ADMIN_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('zoneMode', () => {
  it('mặc định path — thiếu biến thì máy dev vẫn đúng', () => {
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', '');
    expect(zoneMode()).toBe(PATH);
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'bogus');
    expect(zoneMode()).toBe(PATH);
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'host');
    expect(zoneMode()).toBe(HOST);
  });
});

describe('zoneBase / zonePath', () => {
  it('path: tiền tố thư mục; gốc khu là chính tiền tố', () => {
    expect(zoneBase(ZONE.MARKET, PATH)).toBe('');
    expect(zoneBase(ZONE.PARTNER, PATH)).toBe('/manage');
    expect(zoneBase(ZONE.ADMIN, PATH)).toBe('/admin');
    expect(zonePath(ZONE.PARTNER, '/', PATH)).toBe('/manage');
    expect(zonePath(ZONE.PARTNER, '/vehicles', PATH)).toBe('/manage/vehicles');
    expect(zonePath(ZONE.ADMIN, '/tenants', PATH)).toBe('/admin/tenants');
    expect(zonePath(ZONE.MARKET, '/', PATH)).toBe('/');
  });

  it('host: path sạch ở mọi khu', () => {
    expect(zonePath(ZONE.PARTNER, '/', HOST)).toBe('/');
    expect(zonePath(ZONE.PARTNER, '/vehicles', HOST)).toBe('/vehicles');
    expect(zonePath(ZONE.ADMIN, '/tenants', HOST)).toBe('/tenants');
  });
});

describe('zoneHref / siteHref / crossZoneHref', () => {
  it('host: URL tuyệt đối theo site, bỏ dấu / thừa của biến', () => {
    stubHostSites();
    expect(zoneHref(ZONE.PARTNER, '/register?track=package', HOST)).toBe(
      'https://partner.xeprime.vn/register?track=package',
    );
    expect(zoneHref(ZONE.MARKET, '/', HOST)).toBe('https://xeprime.vn/');
    expect(zoneHref(ZONE.ADMIN, '', HOST)).toBe('https://admin.xeprime.vn/');
  });

  it('path: URL của khu đã gồm tiền tố, ghép thẳng path', () => {
    stubPathSites();
    expect(zoneHref(ZONE.PARTNER, '/vehicles', PATH)).toBe('http://localhost:3000/manage/vehicles');
  });

  it('chưa khai URL site → đường dẫn tương đối (đúng ở chế độ path)', () => {
    expect(zoneHref(ZONE.PARTNER, '/vehicles', PATH)).toBe('/manage/vehicles');
    expect(zoneHref(ZONE.PARTNER, '/vehicles', HOST)).toBe('/vehicles');
  });

  it('siteHref: tương đối ở path, tuyệt đối ở host', () => {
    stubHostSites();
    expect(siteHref(ZONE.PARTNER, '/register', PATH)).toBe('/manage/register');
    expect(siteHref(ZONE.PARTNER, '/register', HOST)).toBe('https://partner.xeprime.vn/register');
  });

  it('crossZoneHref: cùng khu hoặc chế độ path → tương đối; khác host → tuyệt đối', () => {
    stubHostSites();
    expect(crossZoneHref(ZONE.PARTNER, ZONE.PARTNER, '/chat', HOST)).toBe('/chat');
    expect(crossZoneHref(ZONE.MARKET, ZONE.PARTNER, '/chat', PATH)).toBe('/manage/chat');
    expect(crossZoneHref(ZONE.MARKET, ZONE.PARTNER, '/chat', HOST)).toBe(
      'https://partner.xeprime.vn/chat',
    );
  });
});

describe('isSafeTarget', () => {
  it('đường dẫn nội bộ an toàn', () => {
    expect(isSafeTarget('/trips')).toBe(true);
    expect(isSafeTarget('/manage/vehicles?status=active')).toBe(true);
  });

  it('URL tuyệt đối chỉ an toàn khi đúng origin của một trong ba site', () => {
    stubHostSites();
    expect(isSafeTarget('https://partner.xeprime.vn/vehicles')).toBe(true);
    expect(isSafeTarget('https://admin.xeprime.vn/')).toBe(true);
    expect(isSafeTarget('https://xeprime.vn/trips')).toBe(true);
    // Cùng tên miền gốc nhưng khác origin (giao thức, cổng, host con lạ) — không tin.
    expect(isSafeTarget('http://partner.xeprime.vn/vehicles')).toBe(false);
    expect(isSafeTarget('https://partner.xeprime.vn:8443/')).toBe(false);
    expect(isSafeTarget('https://evil.xeprime.vn/')).toBe(false);
    expect(isSafeTarget('https://partner.xeprime.vn.evil.test/')).toBe(false);
  });

  it('mọi thứ còn lại là không an toàn', () => {
    stubHostSites();
    for (const bad of [
      null,
      undefined,
      '',
      '//evil.test',
      '/\\evil.test',
      'javascript:alert(1)',
      'data:text/html,x',
      'https://evil.test/',
      'vehicles',
    ]) {
      expect(isSafeTarget(bad), String(bad)).toBe(false);
    }
  });
});

describe('zoneForHost', () => {
  it('so cả host lẫn cổng, không phân biệt hoa thường', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'http://xeprime.test:3000');
    vi.stubEnv('NEXT_PUBLIC_WEB_PARTNER_URL', 'http://partner.xeprime.test:3000');
    vi.stubEnv('NEXT_PUBLIC_WEB_ADMIN_URL', 'http://admin.xeprime.test:3000');
    expect(zoneForHost('xeprime.test:3000')).toBe(ZONE.MARKET);
    expect(zoneForHost('Partner.XePrime.test:3000')).toBe(ZONE.PARTNER);
    expect(zoneForHost('admin.xeprime.test:3000')).toBe(ZONE.ADMIN);
    expect(zoneForHost('partner.xeprime.test')).toBeNull();
    expect(zoneForHost('api.xeprime.test:3000')).toBeNull();
    expect(zoneForHost(null)).toBeNull();
  });

  it('URL khai sai của một khu không làm hỏng các khu còn lại', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'not a url');
    vi.stubEnv('NEXT_PUBLIC_WEB_PARTNER_URL', 'https://partner.xeprime.vn');
    expect(zoneForHost('partner.xeprime.vn')).toBe(ZONE.PARTNER);
  });
});

describe('khu của đường dẫn nội bộ', () => {
  it('zoneOfInternalPath: /admin trước /manage, còn lại là khu khách', () => {
    expect(zoneOfInternalPath('/admin')).toBe(ZONE.ADMIN);
    expect(zoneOfInternalPath('/admin/tenants')).toBe(ZONE.ADMIN);
    expect(zoneOfInternalPath('/manage')).toBe(ZONE.PARTNER);
    expect(zoneOfInternalPath('/manage/vehicles')).toBe(ZONE.PARTNER);
    expect(zoneOfInternalPath('/managed')).toBe(ZONE.MARKET);
    expect(zoneOfInternalPath('/administrator')).toBe(ZONE.MARKET);
    expect(zoneOfInternalPath('/vehicles')).toBe(ZONE.MARKET);
  });

  it('isPathInZone: path so tiền tố; host mọi đường tương đối thuộc khu hiện tại', () => {
    expect(isPathInZone(ZONE.PARTNER, '/manage/vehicles?x=1', PATH)).toBe(true);
    expect(isPathInZone(ZONE.PARTNER, '/admin/tenants', PATH)).toBe(false);
    expect(isPathInZone(ZONE.MARKET, '/trips', PATH)).toBe(true);
    expect(isPathInZone(ZONE.PARTNER, '/vehicles', HOST)).toBe(true);
    expect(isPathInZone(ZONE.PARTNER, '//evil.test', HOST)).toBe(false);
  });

  it('zoneRelativePath là nghịch đảo của zonePath', () => {
    expect(zoneRelativePath(ZONE.PARTNER, '/manage', PATH)).toBe('/');
    expect(zoneRelativePath(ZONE.PARTNER, '/manage/register?track=x', PATH)).toBe(
      '/register?track=x',
    );
    expect(zoneRelativePath(ZONE.PARTNER, '/manage?tab=1', PATH)).toBe('/?tab=1');
    expect(zoneRelativePath(ZONE.PARTNER, '/managed', PATH)).toBe('/managed');
    expect(zoneRelativePath(ZONE.PARTNER, '/register', HOST)).toBe('/register');
  });

  it('internalPathOf: luôn là thư mục app/ bất kể chế độ', () => {
    expect(internalPathOf(ZONE.PARTNER, '/')).toBe('/manage');
    expect(internalPathOf(ZONE.PARTNER, '/vehicles')).toBe('/manage/vehicles');
    expect(internalPathOf(ZONE.ADMIN, '/tenants')).toBe('/admin/tenants');
    expect(internalPathOf(ZONE.MARKET, '/trips')).toBe('/trips');
  });
});

describe('partnerPathFromApi', () => {
  it('dạng /manage/... của API → đường dẫn hiển thị theo chế độ đang chạy', () => {
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'path');
    expect(partnerPathFromApi('/manage/vehicles/01V/manage')).toBe('/manage/vehicles/01V/manage');
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'host');
    expect(partnerPathFromApi('/manage/vehicles/01V/manage')).toBe('/vehicles/01V/manage');
    expect(partnerPathFromApi('/manage')).toBe('/');
    expect(partnerPathFromApi('/manage?tab=x')).toBe('/?tab=x');
  });

  it('không phải dạng đó → trả nguyên', () => {
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'host');
    expect(partnerPathFromApi('/trips')).toBe('/trips');
    expect(partnerPathFromApi('/managed')).toBe('/managed');
    expect(partnerPathFromApi('https://xeprime.vn/x')).toBe('https://xeprime.vn/x');
  });
});
