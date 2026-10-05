import { NextRequest, type NextResponse } from 'next/server';
import { ACCOUNT_REALM, ACCOUNT_REALM_HEADER, resolveSessionCookieName } from '@xeprime/types';
import type { AccountRealm } from '@xeprime/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Ma trận của `proxy.ts` — host × đường dẫn × cookie × chế độ (ADR 0051 điều 2 · ADR 0053).
 *
 * Proxy quyết định TRƯỚC khi render, nên sai ở đây là vòng lặp redirect, lộ route của site khác,
 * hoặc cookie của site này mở cổng site kia. Mỗi chế độ nạp lại module: `ROUTES` dựng một lần lúc
 * nạp theo `NEXT_PUBLIC_XP_ZONE_MODE`, đúng như bundle thật (biến được nhúng lúc build).
 */

type Cookie = 'customer' | 'partner' | 'platform';

const COOKIE: Record<Cookie, string> = {
  customer: resolveSessionCookieName({}, ACCOUNT_REALM.CUSTOMER),
  partner: resolveSessionCookieName({}, ACCOUNT_REALM.PARTNER),
  platform: resolveSessionCookieName({}, ACCOUNT_REALM.PLATFORM),
};

const HOSTS = {
  market: 'xeprime.test:3000',
  partner: 'partner.xeprime.test:3000',
  admin: 'admin.xeprime.test:3000',
} as const;

interface Call {
  host?: string;
  cookies?: Cookie[];
  headers?: Record<string, string>;
}

interface Outcome {
  status: number;
  location: string | null;
  rewrite: string | null;
  next: boolean;
  noindex: boolean;
  response: NextResponse;
}

async function loadProxy(mode: 'path' | 'host', extraEnv: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('SESSION_COOKIE_NAME', '');
  vi.stubEnv('API_PROXY_TARGET', '');
  if (mode === 'host') {
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'host');
    vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', `http://${HOSTS.market}`);
    vi.stubEnv('NEXT_PUBLIC_WEB_PARTNER_URL', `http://${HOSTS.partner}`);
    vi.stubEnv('NEXT_PUBLIC_WEB_ADMIN_URL', `http://${HOSTS.admin}`);
  } else {
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'path');
    vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_WEB_PARTNER_URL', 'http://localhost:3000/manage');
    vi.stubEnv('NEXT_PUBLIC_WEB_ADMIN_URL', 'http://localhost:3000/admin');
  }
  for (const [key, value] of Object.entries(extraEnv)) vi.stubEnv(key, value);
  const { proxy } = await import('./proxy');

  return (path: string, call: Call = {}): Outcome => {
    const host = call.host ?? 'localhost:3000';
    const req = new NextRequest(new URL(path, `http://${host}`), {
      headers: { host, ...call.headers },
    });
    for (const cookie of call.cookies ?? []) req.cookies.set(COOKIE[cookie], 'token');
    const response = proxy(req);
    return {
      status: response.status,
      location: response.headers.get('location'),
      rewrite: response.headers.get('x-middleware-rewrite'),
      next: response.headers.get('x-middleware-next') === '1',
      noindex: (response.headers.get('x-robots-tag') ?? '').includes('noindex'),
      response,
    };
  };
}

/** Header request mà proxy ghi đè khi chuyển `/api` (Next mã hoá chúng vào response middleware). */
function forwardedHeader(outcome: Outcome, name: string): string | null {
  return outcome.response.headers.get(`x-middleware-request-${name}`);
}

function forwardedHeaderNames(outcome: Outcome): string[] {
  return (outcome.response.headers.get('x-middleware-override-headers') ?? '').split(',');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('proxy — chế độ path (máy dev, ba khu chung localhost:3000)', () => {
  const L = 'http://localhost:3000';

  it('site khách: trang công khai đi tiếp, không gắn noindex', async () => {
    const run = await loadProxy('path');
    for (const path of ['/', '/vehicles', '/xe/01H', '/trips', '/account', '/account/balance']) {
      const out = run(path);
      expect(out.next, path).toBe(true);
      expect(out.noindex, path).toBe(false);
    }
  });

  it('B2: trang chủ xe cũ trên site khách → 307 sang khu partner, GIỮ query', async () => {
    const run = await loadProxy('path');
    const cases: Array<[string, string]> = [
      ['/account/vehicles?status=active', '/manage/vehicles?status=active'],
      ['/account/vehicles/01VEH', '/manage/vehicles/01VEH'],
      ['/account/vehicles/01VEH/manage/pricing', '/manage/vehicles/01VEH/manage/pricing'],
      ['/account/calendar', '/manage/calendar'],
      ['/account/earnings', '/manage/balance'],
      ['/account/registration', '/manage/registration'],
      ['/account/messages?c=01CONV', '/manage/chat?c=01CONV'],
      ['/list-your-vehicle/register?from=landing', '/manage/vehicles/register?from=landing'],
      ['/invites/tok123', '/manage/invites/tok123'],
    ];
    for (const [from, to] of cases) {
      const out = run(from);
      expect(out.status, from).toBe(307);
      expect(out.location, from).toBe(`${L}${to}`);
    }
  });

  it('/login /register cũ của site khách → trang chủ mở modal; đã đăng nhập → next an toàn', async () => {
    const run = await loadProxy('path');
    expect(run('/login').location).toBe(`${L}/?auth=login`);
    expect(run('/register?next=%2Ftrips').location).toBe(`${L}/?auth=register&next=%2Ftrips`);
    expect(run('/login', { cookies: ['customer'] }).location).toBe(`${L}/`);
    expect(run('/login?next=%2Ftrips', { cookies: ['customer'] }).location).toBe(`${L}/trips`);
    expect(run('/login?next=https%3A%2F%2Fevil.test', { cookies: ['customer'] }).location).toBe(
      `${L}/`,
    );
    // Cookie của site partner KHÔNG phải phiên khách.
    expect(run('/login', { cookies: ['partner'] }).location).toBe(`${L}/?auth=login`);
  });

  it('khu partner: chưa có cookie partner → /manage/login giữ next; cookie site khác không mở cổng', async () => {
    const run = await loadProxy('path');
    expect(run('/manage').location).toBe(`${L}/manage/login?next=%2Fmanage`);
    expect(run('/manage/vehicles?status=active').location).toBe(
      `${L}/manage/login?next=%2Fmanage%2Fvehicles%3Fstatus%3Dactive`,
    );
    for (const cookie of ['customer', 'platform'] as const) {
      expect(run('/manage/bookings', { cookies: [cookie] }).location, cookie).toBe(
        `${L}/manage/login?next=%2Fmanage%2Fbookings`,
      );
    }
    const ok = run('/manage/bookings', { cookies: ['partner'] });
    expect(ok.next).toBe(true);
    expect(ok.noindex).toBe(true);
  });

  it('khu partner: trang công khai đi tiếp kể cả có cookie (chống loop phiên hết hạn)', async () => {
    const run = await loadProxy('path');
    for (const path of [
      '/manage/login',
      '/manage/login?next=%2Fmanage',
      '/manage/register?track=package',
      '/manage/forgot-password',
      '/manage/reset-password?token=x',
      '/manage/invites/tok123',
    ]) {
      expect(run(path).next, path).toBe(true);
      expect(run(path, { cookies: ['partner'] }).next, path).toBe(true);
      expect(run(path).noindex, path).toBe(true);
    }
  });

  it('/manage/onboarding chưa đăng nhập → login kèm intent=owner', async () => {
    const run = await loadProxy('path');
    const location = run('/manage/onboarding').location ?? '';
    expect(location).toContain('/manage/login');
    expect(location).toContain('next=%2Fmanage%2Fonboarding');
    expect(location).toContain('intent=owner');
  });

  it('khu quản trị: chỉ cookie platform mở cổng; trang đăng nhập/quên mật khẩu công khai', async () => {
    const run = await loadProxy('path');
    expect(run('/admin').location).toBe(`${L}/admin/login?next=%2Fadmin`);
    expect(run('/admin/tenants', { cookies: ['partner'] }).location).toBe(
      `${L}/admin/login?next=%2Fadmin%2Ftenants`,
    );
    expect(run('/admin/tenants', { cookies: ['customer'] }).location).toBe(
      `${L}/admin/login?next=%2Fadmin%2Ftenants`,
    );
    const ok = run('/admin/tenants', { cookies: ['platform'] });
    expect(ok.next).toBe(true);
    expect(ok.noindex).toBe(true);
    for (const path of ['/admin/login', '/admin/forgot-password', '/admin/reset-password']) {
      expect(run(path).next, path).toBe(true);
    }
  });

  it('chuyến đi thuê cũ trong cổng quản lý → /trips của site khách, KHÔNG qua cổng phiên partner', async () => {
    const run = await loadProxy('path');
    expect(run('/manage/account/trips').location).toBe(`${L}/trips`);
    expect(run('/manage/account/trips/01TRIP?tab=x').location).toBe(`${L}/trips/01TRIP?tab=x`);
  });

  it('URL quản trị cũ /manage/admin/* → 307 /admin/* giữ query', async () => {
    const run = await loadProxy('path');
    const out = run('/manage/admin/tenants?status=active');
    expect(out.status).toBe(307);
    expect(out.location).toBe(`${L}/admin/tenants?status=active`);
    expect(run('/manage/admin').location).toBe(`${L}/admin`);
  });

  it('đường dùng chung (/legal, /.well-known) không bị gác hay chuyển', async () => {
    const run = await loadProxy('path');
    expect(run('/legal/terms').next).toBe(true);
    expect(run('/.well-known/assetlinks.json').next).toBe(true);
  });

  it('/api → API local, realm theo khu của TRANG gọi (Referer), xoá khoá proxy client gửi', async () => {
    const run = await loadProxy('path');
    const realmOf = (referer?: string): string | null => {
      const out = run('/api/auth/me?x=1', {
        headers: {
          ...(referer ? { referer } : {}),
          [ACCOUNT_REALM_HEADER]: ACCOUNT_REALM.PLATFORM,
          'x-xp-proxy-secret': 'client-forged',
        },
      });
      expect(out.rewrite).toBe('http://localhost:4000/auth/me?x=1');
      expect(forwardedHeaderNames(out)).not.toContain('x-xp-proxy-secret');
      return forwardedHeader(out, ACCOUNT_REALM_HEADER);
    };
    const expected: Array<[string | undefined, AccountRealm]> = [
      [undefined, ACCOUNT_REALM.CUSTOMER],
      [`${L}/vehicles`, ACCOUNT_REALM.CUSTOMER],
      [`${L}/manage/vehicles`, ACCOUNT_REALM.PARTNER],
      [`${L}/manage`, ACCOUNT_REALM.PARTNER],
      [`${L}/admin/tenants`, ACCOUNT_REALM.PLATFORM],
      ['https://evil.test/admin', ACCOUNT_REALM.CUSTOMER],
    ];
    for (const [referer, realm] of expected) expect(realmOf(referer), referer).toBe(realm);
  });

  it('/api/stg/* là route handler riêng — để nguyên', async () => {
    const run = await loadProxy('path');
    const out = run('/api/stg/auth/me');
    expect(out.next).toBe(true);
    expect(out.rewrite).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('proxy — chế độ host (staging/production, mỗi khu một host)', () => {
  const P = `http://${HOSTS.partner}`;
  const A = `http://${HOSTS.admin}`;

  it('site khách: trang công khai đi tiếp, không rewrite, không noindex', async () => {
    const run = await loadProxy('host');
    for (const path of ['/', '/vehicles', '/account/balance', '/list-your-vehicle']) {
      const out = run(path, { host: HOSTS.market });
      expect(out.next, path).toBe(true);
      expect(out.rewrite, path).toBeNull();
      expect(out.noindex, path).toBe(false);
    }
  });

  it('site khách: URL cũ mang tiền tố và trang chủ xe cũ → 307 sang ĐÚNG host + path sạch', async () => {
    const run = await loadProxy('host');
    const cases: Array<[string, string]> = [
      ['/manage', `${P}/`],
      ['/manage/vehicles?status=active', `${P}/vehicles?status=active`],
      ['/manage/admin/tenants', `${A}/tenants`],
      ['/account/vehicles', `${P}/vehicles`],
      ['/account/earnings', `${P}/balance`],
      ['/list-your-vehicle/register', `${P}/vehicles/register`],
      ['/invites/tok123', `${P}/invites/tok123`],
    ];
    for (const [from, to] of cases) {
      const out = run(from, { host: HOSTS.market });
      expect(out.status, from).toBe(307);
      expect(out.location, from).toBe(to);
    }
  });

  it('site khách: tiền tố nội bộ /admin gõ thẳng → 404 (không lộ trang quản trị)', async () => {
    const run = await loadProxy('host');
    const out = run('/admin/tenants', { host: HOSTS.market, cookies: ['platform'] });
    expect(out.rewrite).toContain('/__xp_zone_not_found');
  });

  it('site partner: rewrite sang thư mục nội bộ khi có cookie partner, noindex', async () => {
    const run = await loadProxy('host');
    const home = run('/', { host: HOSTS.partner, cookies: ['partner'] });
    expect(home.rewrite).toBe(`${P}/manage`);
    expect(home.noindex).toBe(true);
    const list = run('/vehicles?status=active', { host: HOSTS.partner, cookies: ['partner'] });
    expect(list.rewrite).toBe(`${P}/manage/vehicles?status=active`);
  });

  it('site partner: thiếu cookie partner → /login CỦA site partner; cookie site khác không tính', async () => {
    const run = await loadProxy('host');
    for (const cookies of [[], ['customer'], ['platform']] as Cookie[][]) {
      const out = run('/bookings', { host: HOSTS.partner, cookies });
      expect(out.location, cookies.join()).toBe(`${P}/login?next=%2Fbookings`);
      expect(out.noindex).toBe(true);
    }
    const onboarding = run('/onboarding', { host: HOSTS.partner }).location ?? '';
    expect(onboarding).toContain('intent=owner');
  });

  it('site partner: trang công khai rewrite không cần phiên', async () => {
    const run = await loadProxy('host');
    for (const path of ['/login', '/register', '/forgot-password', '/reset-password', '/invites/t']) {
      const out = run(path, { host: HOSTS.partner });
      expect(out.rewrite, path).toBe(`${P}/manage${path}`);
    }
  });

  it('chuyến đi thuê cũ (site partner hoặc tiền tố cũ) → /trips của site khách', async () => {
    const run = await loadProxy('host');
    const M = `http://${HOSTS.market}`;
    expect(run('/account/trips/01TRIP', { host: HOSTS.partner }).location).toBe(`${M}/trips/01TRIP`);
    expect(run('/manage/account/trips', { host: HOSTS.market }).location).toBe(`${M}/trips`);
    // Trên site khách `/account/trips` không phải trang nào cả — không bị chuyển đi đâu.
    expect(run('/account/trips', { host: HOSTS.market }).next).toBe(true);
  });

  it('site partner: /manage/* cũ → path sạch cùng host; /admin/* → 404', async () => {
    const run = await loadProxy('host');
    expect(run('/manage/vehicles', { host: HOSTS.partner }).location).toBe(`${P}/vehicles`);
    expect(run('/admin/tenants', { host: HOSTS.partner, cookies: ['partner'] }).rewrite).toContain(
      '/__xp_zone_not_found',
    );
  });

  it('site quản trị: chỉ cookie platform mở cổng, rewrite sang /admin/*', async () => {
    const run = await loadProxy('host');
    expect(run('/', { host: HOSTS.admin }).location).toBe(`${A}/login?next=%2F`);
    expect(run('/tenants', { host: HOSTS.admin, cookies: ['partner'] }).location).toBe(
      `${A}/login?next=%2Ftenants`,
    );
    const ok = run('/tenants?status=active', { host: HOSTS.admin, cookies: ['platform'] });
    expect(ok.rewrite).toBe(`${A}/admin/tenants?status=active`);
    expect(ok.noindex).toBe(true);
    expect(run('/login', { host: HOSTS.admin }).rewrite).toBe(`${A}/admin/login`);
  });

  it('site quản trị: tiền tố nội bộ của chính nó → path sạch; /manage/admin cũ → path sạch', async () => {
    const run = await loadProxy('host');
    expect(run('/admin/tenants', { host: HOSTS.admin }).location).toBe(`${A}/tenants`);
    expect(run('/manage/admin/plans', { host: HOSTS.admin }).location).toBe(`${A}/plans`);
  });

  it('host lạ (vd api.* lọt tới web) → để nguyên', async () => {
    const run = await loadProxy('host');
    const out = run('/vehicles', { host: 'api.xeprime.test:3000' });
    expect(out.next).toBe(true);
    expect(out.rewrite).toBeNull();
  });

  it('/api: không có API_PROXY_TARGET thì để Caddy lo (đi tiếp nguyên vẹn)', async () => {
    const run = await loadProxy('host');
    const out = run('/api/auth/me', { host: HOSTS.partner });
    expect(out.next).toBe(true);
    expect(out.rewrite).toBeNull();
  });

  it('/api có API_PROXY_TARGET (chạy host không Caddy): realm theo HOST, không theo Referer', async () => {
    const run = await loadProxy('host', { API_PROXY_TARGET: 'http://localhost:4000' });
    const expected: Array<[string, AccountRealm]> = [
      [HOSTS.market, ACCOUNT_REALM.CUSTOMER],
      [HOSTS.partner, ACCOUNT_REALM.PARTNER],
      [HOSTS.admin, ACCOUNT_REALM.PLATFORM],
    ];
    for (const [host, realm] of expected) {
      const out = run('/api/auth/me', { host, headers: { referer: `${A}/tenants` } });
      expect(out.rewrite, host).toBe('http://localhost:4000/auth/me');
      expect(forwardedHeader(out, ACCOUNT_REALM_HEADER), host).toBe(realm);
    }
  });
});
