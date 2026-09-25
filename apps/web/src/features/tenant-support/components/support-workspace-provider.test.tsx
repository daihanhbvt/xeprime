import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import {
  API_ERROR_CODE,
  FEATURE_STATE,
  PERMISSION,
  PLAN_FEATURE,
  SUPPORT_MODE,
  SUPPORT_WORKSPACE,
} from '@xeprime/types';
import { useFeature } from '@/hooks/use-feature';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { renderWithIntl } from '@/i18n/test-utils';
import {
  ADMIN_PLATFORM_PERMISSIONS,
  CONTEXT_A,
  CONTEXT_B,
  supportContextFixture,
} from '../test-utils';
import {
  SupportDataScope,
  SupportSessionBoundary,
  supportWorkspaceValue,
} from './SupportWorkspaceProvider';

/**
 * Vỏ phiên hỗ trợ (ADR 0050). Khoá bốn điều:
 *
 *  1. Dữ liệu gian hàng đọc trong phiên KHÔNG rò sang phiên khác — đổi phiên là đổi hẳn cache.
 *  2. Trong phiên, quyền là quyền SUY TỪ capability, không phải quyền nền tảng của người đăng nhập.
 *  3. Phiên hết hạn/không hợp lệ nói rõ là đã kết thúc, không dựng khu làm việc.
 *  4. Băng cảnh báo luôn có: tên gian hàng, tuyến, người thao tác, hạn, nút thoát.
 */
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/manage/admin/tenants',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      id: 'admin-1',
      displayName: 'Hỗ trợ viên Lan',
      permissions: ADMIN_PLATFORM_PERMISSIONS,
      platformRole: 'platform_admin',
      tenant: null,
    },
    isLoading: false,
  }),
}));

const api = vi.hoisted(() => ({
  fetchSupportContext: vi.fn(),
  revokeSupportContext: vi.fn(),
  openSupportContext: vi.fn(),
}));
vi.mock('../api', () => api);

/** "Server" của gian hàng: trả dữ liệu khác nhau tuỳ phiên đang mở. */
const server = vi.hoisted(() => ({ current: 'A', calls: 0 }));

function Probe() {
  const vehicle = useQuery({
    // Key y hệt key thật của feature xe — không mang gian hàng, đúng thứ khiến cache chung rò.
    queryKey: ['vehicles', 'detail', 'v1'],
    queryFn: async () => {
      server.calls += 1;
      return `xe-cua-gian-hang-${server.current}`;
    },
  });
  const { has } = usePermissions();
  const { paths, vehicles } = useWorkspace();
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const maintenance = useFeature(PLAN_FEATURE.MAINTENANCE);
  return (
    <div>
      <span data-testid="vehicle">{vehicle.data ?? 'loading'}</span>
      <span data-testid="can-update">{String(has(PERMISSION.VEHICLE_UPDATE))}</span>
      <span data-testid="can-create">{String(has(PERMISSION.VEHICLE_CREATE))}</span>
      <span data-testid="can-platform">{String(has(PERMISSION.PLATFORM_TENANT_MANAGE))}</span>
      <span data-testid="home">{paths.vehicles}</span>
      <span data-testid="detail">{vehicles.detail('v1')}</span>
      <span data-testid="finance">{String(finance.isVisible)}</span>
      <span data-testid="maintenance">{String(maintenance.isVisible)}</span>
    </div>
  );
}

function renderProvider(contextId: string, outer = new QueryClient()) {
  const ui = (id: string) => (
    <QueryClientProvider client={outer}>
      <App>
        {/* Đúng cách AppShell + layout của route phiên lồng hai lớp. */}
        <SupportSessionBoundary key={id} contextId={id}>
          <SupportDataScope key={id}>
            <Probe />
          </SupportDataScope>
        </SupportSessionBoundary>
      </App>
    </QueryClientProvider>
  );
  const result = renderWithIntl(ui(contextId));
  return { ...result, switchTo: (id: string) => result.rerender(ui(id)), outer };
}

beforeEach(() => {
  server.current = 'A';
  server.calls = 0;
  api.fetchSupportContext.mockImplementation(async (id: string) =>
    supportContextFixture({
      id,
      tenant: {
        ...supportContextFixture().tenant,
        name: id === CONTEXT_A ? 'Gian hàng A' : 'Gian hàng B',
      },
    }),
  );
  api.revokeSupportContext.mockResolvedValue({ ok: true });
  nav.push.mockReset();
});

afterEach(() => cleanup());

describe('SupportSessionBoundary + SupportDataScope', () => {
  it('đổi phiên là đổi hẳn cache — dữ liệu gian hàng A không hiện trong phiên B (13)', async () => {
    const view = renderProvider(CONTEXT_A);
    await screen.findByText('xe-cua-gian-hang-A');

    server.current = 'B';
    view.switchTo(CONTEXT_B);

    // Cùng query key, staleTime 30s: dùng chung cache thì phiên B sẽ thấy ngay dữ liệu của A.
    await screen.findByText('xe-cua-gian-hang-B');
    expect(screen.queryByText('xe-cua-gian-hang-A')).toBeNull();
    expect(server.calls).toBe(2);
    // Và dữ liệu gian hàng không bao giờ nằm ở cache CHÍNH.
    expect(view.outer.getQueryData(['vehicles', 'detail', 'v1'])).toBeUndefined();
  });

  it('quyền trong phiên là quyền của capability, không phải quyền nền tảng của admin', async () => {
    renderProvider(CONTEXT_A);
    await screen.findByText('xe-cua-gian-hang-A');
    expect(screen.getByTestId('can-update').textContent).toContain('true');
    // Admin có `vehicles.create` và `platform.tenants.manage` — trong phiên thì không.
    expect(screen.getByTestId('can-create').textContent).toContain('false');
    expect(screen.getByTestId('can-platform').textContent).toContain('false');
  });

  it('link "về chỗ làm việc" dẫn về trang đầu của PHIÊN, không ra /account hay /manage', async () => {
    renderProvider(CONTEXT_A);
    await screen.findByText('xe-cua-gian-hang-A');
    expect(screen.getByTestId('home').textContent).toContain(
      `/manage/admin/tenant-support/${CONTEXT_A}`,
    );
    expect(screen.getByTestId('detail').textContent).toContain(
      `/manage/admin/tenant-support/${CONTEXT_A}/vehicles/v1/manage`,
    );
  });

  it('băng cảnh báo: tên gian hàng, tuyến, người thao tác, hạn, nút thoát', async () => {
    renderProvider(CONTEXT_A);
    await screen.findByText('Đang hỗ trợ: Gian hàng A');
    screen.getByText('Tuyến hoa hồng · Owner Lite');
    screen.getByText('Người thao tác: Hỗ trợ viên Lan');
    screen.getByText(/Hết hạn lúc/);

    fireEvent.click(screen.getByRole('button', { name: /Thoát chế độ hỗ trợ/ }));
    await waitFor(() => expect(api.revokeSupportContext).toHaveBeenCalledWith(CONTEXT_A));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(ROUTES.MANAGE.ADMIN_TENANTS));
  });

  it('phiên hết hạn: nói rõ đã kết thúc và không dựng khu làm việc', async () => {
    api.fetchSupportContext.mockRejectedValue(
      new ApiClientError({
        status: 403,
        code: API_ERROR_CODE.SUPPORT_CONTEXT_EXPIRED,
        message: 'x',
      }),
    );
    renderProvider(CONTEXT_A);
    await screen.findByText('Phiên hỗ trợ đã kết thúc');
    expect(screen.queryByTestId('vehicle')).toBeNull();
    expect(server.calls).toBe(0);
  });

  it('phiên của người khác / phiên đăng nhập khác: báo không hợp lệ', async () => {
    api.fetchSupportContext.mockRejectedValue(
      new ApiClientError({
        status: 403,
        code: API_ERROR_CODE.SUPPORT_CONTEXT_INVALID,
        message: 'x',
      }),
    );
    renderProvider(CONTEXT_A);
    await screen.findByText('Không mở được phiên hỗ trợ này');
  });

  it('phiên chế độ xem: không có quyền ghi nào', async () => {
    api.fetchSupportContext.mockResolvedValue(
      supportContextFixture({
        mode: SUPPORT_MODE.VIEW,
        capabilities: ['vehicle.view'],
        permissions: [PERMISSION.VEHICLE_VIEW, PERMISSION.BRANCH_VIEW],
      }),
    );
    renderProvider(CONTEXT_A);
    await screen.findByText('xe-cua-gian-hang-A');
    expect(screen.getByTestId('can-update').textContent).toContain('false');
    screen.getByText('Chỉ xem');
  });

  it('khu tiền/công nợ/hợp đồng luôn ẩn trong phiên, dù gói của gian hàng mở chúng (ADR 0050 §10)', async () => {
    const base = supportContextFixture({ workspace: SUPPORT_WORKSPACE.MANAGE });
    api.fetchSupportContext.mockResolvedValue({
      ...base,
      tenant: {
        ...base.tenant,
        features: [
          { feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.ENABLED },
          { feature: PLAN_FEATURE.MAINTENANCE, state: FEATURE_STATE.ENABLED },
        ],
      },
    });
    renderProvider(CONTEXT_A);
    await screen.findByText('xe-cua-gian-hang-A');
    expect(screen.getByTestId('finance').textContent).toBe('false');
    // Cờ khác vẫn theo gói của gian hàng.
    expect(screen.getByTestId('maintenance').textContent).toBe('true');
  });
});

describe('supportWorkspaceValue — bảng đường dẫn của phiên', () => {
  it('đích KHÔNG có trong phiên giữ href thật (lớp điều hướng chặn và báo) — không đổi thành trang đầu', () => {
    const value = supportWorkspaceValue(
      supportContextFixture({ workspace: SUPPORT_WORKSPACE.MANAGE }),
    );
    expect(value.paths.vehicles).toBe(`/manage/admin/tenant-support/${CONTEXT_A}/vehicles`);
    expect(value.paths.home).toBe(`/manage/admin/tenant-support/${CONTEXT_A}/dashboard`);
    // Chat không mở trong phiên: link "Tin nhắn" giữ đích thật (bị chặn kèm thông báo), không
    // biến thành một link dẫn vào Tổng quan.
    expect(value.paths.chat).toBe(ROUTES.MANAGE.CHAT);
  });

  it('package_pending: trang đầu là GỐC phiên (tóm tắt trạng thái), không phải một màn bị khoá', () => {
    const value = supportWorkspaceValue(
      supportContextFixture({ workspace: SUPPORT_WORKSPACE.ONBOARDING, capabilities: [] }),
    );
    expect(value.paths.home).toBe(`/manage/admin/tenant-support/${CONTEXT_A}`);
  });
});
