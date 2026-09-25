import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, SUPPORT_MODE, TENANT_STATUS } from '@xeprime/types';
import { adminTenantSupportPath } from '@/constants/routes';
import { CONTEXT_A, supportContextFixture } from '@/features/tenant-support/test-utils';
import { renderWithIntl } from '@/i18n/test-utils';
import { AdminTenantDetailDrawer } from './AdminTenantDetailDrawer';

/**
 * Lối vào phiên hỗ trợ ở chi tiết gian hàng (ADR 0050): nút chỉ có với quyền RIÊNG
 * `platform.tenant_support.view` (không suy từ `platform.tenants.manage`), bắt buộc lý do, và
 * chế độ "hỗ trợ thao tác" chỉ chọn được khi có quyền đó.
 */
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/manage/admin/tenants',
  useSearchParams: () => new URLSearchParams(),
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => permissions.granted.has(p),
    hasAny: (...keys: string[]) => keys.some((k) => permissions.granted.has(k)),
    isLoading: false,
  }),
}));

vi.mock('@/features/admin-plans/components/TenantPlanSection', () => ({
  TenantPlanSection: () => null,
}));

vi.mock('../hooks/use-admin-tenants', () => ({
  useAdminTenant: () => ({
    isLoading: false,
    data: {
      id: 'tenant-1',
      code: 'GH-01',
      name: 'Gian hàng Minh Đức',
      status: TENANT_STATUS.ACTIVE,
      tenantType: 'individual',
      ownerName: 'Minh Đức',
      ownerPhone: '0901234567',
      ownerEmail: null,
      phone: null,
      provinceName: 'Hồ Chí Minh',
      address: null,
      taxCode: null,
      businessLicenseNo: null,
      vehicleCount: 2,
      bookingCount: 5,
      createdAt: '2026-09-01T00:00:00.000Z',
      currentPlan: null,
    },
  }),
  useTenantActions: () => ({ mutate: vi.fn(), isPending: false }),
}));

const api = vi.hoisted(() => ({
  openSupportContext: vi.fn(),
  fetchSupportContext: vi.fn(),
  revokeSupportContext: vi.fn(),
}));
vi.mock('@/features/tenant-support/api', () => api);

function renderDrawer() {
  return renderWithIntl(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <AdminTenantDetailDrawer tenantId="tenant-1" onClose={vi.fn()} />
      </App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.PLATFORM_TENANT_MANAGE]);
  api.openSupportContext.mockResolvedValue(supportContextFixture());
  nav.push.mockReset();
});
afterEach(() => cleanup());

describe('AdminTenantDetailDrawer — lối vào phiên hỗ trợ', () => {
  it('không có quyền hỗ trợ thì KHÔNG có nút, dù có `platform.tenants.manage`', () => {
    renderDrawer();
    expect(screen.queryByRole('button', { name: /Mở không gian hỗ trợ/ })).toBeNull();
  });

  it('bắt buộc lý do; mở phiên rồi vào đúng gốc của phiên', async () => {
    permissions.granted.add(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /Mở không gian hỗ trợ/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bắt đầu hỗ trợ' }));
    expect(await screen.findByText('Nhập lý do hỗ trợ')).toBeTruthy();
    expect(api.openSupportContext).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/ticket #1234/), {
      target: { value: 'Chủ xe nhờ cập nhật ảnh theo ticket #42' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu hỗ trợ' }));
    await waitFor(() =>
      expect(api.openSupportContext).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        mode: SUPPORT_MODE.VIEW,
        reason: 'Chủ xe nhờ cập nhật ảnh theo ticket #42',
      }),
    );
    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith(adminTenantSupportPath.root(CONTEXT_A)),
    );
  });

  it('không có quyền assist: lựa chọn "Hỗ trợ thao tác" bị khoá', async () => {
    permissions.granted.add(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /Mở không gian hỗ trợ/ }));
    const assist = (await screen.findByRole('radio', {
      name: /Hỗ trợ thao tác/,
    })) as HTMLInputElement;
    expect(assist.disabled).toBe(true);
  });

  it('có quyền assist: chọn được "Hỗ trợ thao tác"', async () => {
    permissions.granted.add(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);
    permissions.granted.add(PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST);
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /Mở không gian hỗ trợ/ }));
    const assist = (await screen.findByRole('radio', {
      name: /Hỗ trợ thao tác/,
    })) as HTMLInputElement;
    expect(assist.disabled).toBe(false);
  });
});

describe('AdminTenantDetailDrawer — xem tách khỏi quản lý (ADR 0050, lượt 2)', () => {
  it('vai support (chỉ xem + hỗ trợ): có nút mở phiên, KHÔNG có khoá/mở khoá', () => {
    permissions.granted = new Set([
      PERMISSION.PLATFORM_TENANT_VIEW,
      PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW,
      PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST,
    ]);
    renderDrawer();
    expect(screen.getByRole('button', { name: /Mở không gian hỗ trợ/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Khoá gian hàng/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mở khoá gian hàng/ })).toBeNull();
  });

  it('có quyền quản lý: nút khoá vẫn như cũ', () => {
    permissions.granted = new Set([
      PERMISSION.PLATFORM_TENANT_VIEW,
      PERMISSION.PLATFORM_TENANT_MANAGE,
    ]);
    renderDrawer();
    expect(screen.getByRole('button', { name: /Khoá gian hàng/ })).toBeTruthy();
  });
});
