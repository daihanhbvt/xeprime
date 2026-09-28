import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LegacyTenantRedirect } from '@/features/admin-tenants/components/LegacyTenantRedirect';

/**
 * URL cũ của danh sách gian hàng chung (`/manage/admin/tenants`) và gốc khối "Đối tác" không
 * được thành trang 404 sau đợt tách 28/09/2026 — bookmark, link trong đơn thuê và lối thoát phiên
 * hỗ trợ đều mang chúng.
 */
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    // `redirect()` thật của Next ném và không bao giờ trả về — trang quên `return` vẫn phải đỏ.
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect }));

type SearchParams = Record<string, string | string[] | undefined>;

async function legacyTenantsPage(params: SearchParams) {
  const { default: Page } = await import('./tenants/page');
  return Page({ searchParams: Promise.resolve(params) });
}

async function redirectTargetOf(run: () => Promise<unknown>): Promise<string> {
  await expect(run()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return String(redirect.mock.calls.at(-1)?.[0]);
}

beforeEach(() => {
  redirect.mockClear();
});

describe('Route cũ của danh sách gian hàng vẫn tới nơi', () => {
  it('/manage/admin/tenants → "Gian hàng gói"', async () => {
    expect(await redirectTargetOf(() => legacyTenantsPage({}))).toBe(
      '/manage/admin/partners/shops',
    );
  });

  it('giữ nguyên bộ lọc cũ (q, status, page) khi chuyển tiếp', async () => {
    const target = await redirectTargetOf(() =>
      legacyTenantsPage({ q: 'Gian hàng ABC', status: 'active', page: '2' }),
    );
    const url = new URL(target, 'http://x');
    expect(url.pathname).toBe('/manage/admin/partners/shops');
    expect(url.searchParams.get('q')).toBe('Gian hàng ABC');
    expect(url.searchParams.get('status')).toBe('active');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('?tenant=<id> KHÔNG đoán loại ở client — giao cho bộ tra loại phía server', async () => {
    const element = await legacyTenantsPage({ tenant: '01HTENANT' });

    expect(redirect).not.toHaveBeenCalled();
    expect(isValidElement(element)).toBe(true);
    expect((element as { type: unknown }).type).toBe(LegacyTenantRedirect);
    expect((element as { props: { tenantId: string } }).props.tenantId).toBe('01HTENANT');
  });

  it('?tenant= rỗng/trắng coi như không có — về danh sách mặc định', async () => {
    expect(await redirectTargetOf(() => legacyTenantsPage({ tenant: '  ' }))).toContain(
      '/manage/admin/partners/shops',
    );
  });

  it('/manage/admin/partners → "Gian hàng gói"', async () => {
    const { default: Page } = await import('./partners/page');
    expect(() => Page()).toThrow('NEXT_REDIRECT:/manage/admin/partners/shops');
  });
});
