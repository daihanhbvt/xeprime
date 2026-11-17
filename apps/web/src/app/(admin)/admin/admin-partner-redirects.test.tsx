import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PartnerTenantResolver } from '@/features/admin-tenants/components/PartnerTenantResolver';

/**
 * Gốc khối "Đối tác" (`/admin/partners`) — điểm vào của hai việc: tra gian hàng chưa biết loại
 * (`?tenant=`, lối của chi tiết đơn thuê và lối thoát phiên hỗ trợ) và người gõ tắt URL. URL cũ
 * `/admin/tenants` đã gỡ (16/11/2026); việc tra gian hàng chuyển về đây.
 */
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    // `redirect()` thật của Next ném và không bao giờ trả về — trang quên `return` vẫn phải đỏ.
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect }));

type SearchParams = Record<string, string | string[] | undefined>;

async function partnersIndex(params: SearchParams) {
  const { default: Page } = await import('./partners/page');
  return Page({ searchParams: Promise.resolve(params) });
}

async function redirectTargetOf(run: () => Promise<unknown>): Promise<string> {
  await expect(run()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return String(redirect.mock.calls.at(-1)?.[0]);
}

beforeEach(() => {
  redirect.mockClear();
});

describe('Gốc khối "Đối tác"', () => {
  it('không tham số → "Gian hàng gói"', async () => {
    expect(await redirectTargetOf(() => partnersIndex({}))).toBe('/admin/partners/shops');
  });

  it('giữ nguyên bộ lọc (q, status, page) khi chuyển tiếp', async () => {
    const target = await redirectTargetOf(() =>
      partnersIndex({ q: 'Gian hàng ABC', status: 'active', page: '2' }),
    );
    const url = new URL(target, 'http://x');
    expect(url.pathname).toBe('/admin/partners/shops');
    expect(url.searchParams.get('q')).toBe('Gian hàng ABC');
    expect(url.searchParams.get('status')).toBe('active');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('?tenant=<id> KHÔNG đoán loại ở client - giao cho bộ tra loại phía server', async () => {
    const element = await partnersIndex({ tenant: '01HTENANT' });

    expect(redirect).not.toHaveBeenCalled();
    expect(isValidElement(element)).toBe(true);
    expect((element as { type: unknown }).type).toBe(PartnerTenantResolver);
    expect((element as { props: { tenantId: string } }).props.tenantId).toBe('01HTENANT');
  });

  it('?tenant= rỗng/trắng coi như không có - về danh sách mặc định', async () => {
    expect(await redirectTargetOf(() => partnersIndex({ tenant: '  ' }))).toContain(
      '/admin/partners/shops',
    );
  });
});
