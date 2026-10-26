import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ value: 'xeprime.vn' }));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: host.value }),
}));

import robots from './robots';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'host');
  vi.stubEnv('NEXT_PUBLIC_WEB_MARKET_URL', 'https://xeprime.vn');
  vi.stubEnv('NEXT_PUBLIC_WEB_PARTNER_URL', 'https://partner.xeprime.vn');
  vi.stubEnv('NEXT_PUBLIC_WEB_ADMIN_URL', 'https://admin.xeprime.vn');
  vi.stubEnv('APP_ENV', 'production');
  host.value = 'xeprime.vn';
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const BLOCK_ALL = { rules: { userAgent: '*', disallow: '/' } };

describe('robots.txt', () => {
  it('site khách production: mở crawl, chặn khu riêng tư, trỏ sitemap', async () => {
    const result = await robots();
    expect(result.sitemap).toBe('https://xeprime.vn/sitemap.xml');
    const rules = result.rules as { allow: string; disallow: string[] };
    expect(rules.allow).toBe('/');
    expect(rules.disallow).toEqual(expect.arrayContaining(['/account', '/trips', '/chat', '/api/']));
    // Trang noindex công khai phải vào được để bot đọc thẻ noindex và đi theo link tới xe.
    expect(rules.disallow).not.toContain('/search');
  });

  it.each(['partner.xeprime.vn', 'admin.xeprime.vn'])('host %s: chặn toàn bộ', async (h) => {
    host.value = h;
    expect(await robots()).toEqual(BLOCK_ALL);
  });

  it('host lạ rơi về luật site khách thay vì chặn nhầm cả site', async () => {
    host.value = '10.0.0.5:3000';
    expect((await robots()).sitemap).toBe('https://xeprime.vn/sitemap.xml');
  });

  it('staging: chặn toàn bộ kể cả site khách', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    expect(await robots()).toEqual(BLOCK_ALL);
  });
});
