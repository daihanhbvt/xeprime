import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_PARTNER_KIND } from '@xeprime/types';

import { LegacyTenantRedirect } from './LegacyTenantRedirect';

/**
 * `/manage/admin/tenants?tenant=<id>` — nơi biết gian hàng nhưng không biết loại (đơn thuê, lối
 * thoát phiên hỗ trợ). Loại phải đến từ `partnerKind` do SERVER suy, không từ client.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }));

const detail = vi.hoisted(() => ({
  data: undefined as { id: string; partnerKind: string } | undefined,
  isError: false,
  lastId: null as string | null,
}));
vi.mock('@/features/admin-tenants/hooks/use-admin-tenants', () => ({
  useAdminTenant: (id: string | null) => {
    detail.lastId = id;
    return detail;
  },
}));

beforeEach(() => {
  nav.replace.mockReset();
  detail.data = undefined;
  detail.isError = false;
  detail.lastId = null;
});
afterEach(cleanup);

describe('LegacyTenantRedirect', () => {
  it('đang tra: hiện trạng thái chờ, chưa điều hướng', () => {
    render(<LegacyTenantRedirect tenantId="t1" />);

    expect(detail.lastId).toBe('t1');
    expect(screen.getByText('Đang mở gian hàng…')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('gian hàng gói → danh sách gian hàng gói, panel mở sẵn', () => {
    detail.data = { id: 't1', partnerKind: PLATFORM_PARTNER_KIND.PACKAGE_SHOP };
    render(<LegacyTenantRedirect tenantId="t1" />);

    expect(nav.replace).toHaveBeenCalledWith('/manage/admin/partners/shops?tenant=t1');
  });

  it('chủ xe cá nhân → danh sách chủ xe cá nhân, panel mở sẵn', () => {
    detail.data = { id: 't2', partnerKind: PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER };
    render(<LegacyTenantRedirect tenantId="t2" />);

    expect(nav.replace).toHaveBeenCalledWith('/manage/admin/partners/owners?tenant=t2');
  });

  it('không tra được (xoá / sai id / mất quyền): nói rõ và đưa lối vào CẢ HAI danh sách', () => {
    detail.isError = true;
    render(<LegacyTenantRedirect tenantId="missing" />);

    expect(screen.getByText('Không mở được gian hàng này')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gian hàng gói' }).getAttribute('href')).toBe(
      '/manage/admin/partners/shops',
    );
    expect(screen.getByRole('link', { name: 'Chủ xe cá nhân' }).getAttribute('href')).toBe(
      '/manage/admin/partners/owners',
    );
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
