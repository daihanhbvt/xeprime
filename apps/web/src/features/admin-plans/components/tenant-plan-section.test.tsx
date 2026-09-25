import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { CurrentPlan } from '../types';
import { TenantPlanSection } from './TenantPlanSection';

/**
 * Gói của gian hàng trong drawer admin: người quản lý GÓI thấy gán/gia hạn/huỷ + lịch sử; người chỉ
 * xem gian hàng (vai support, ADR 0050) thấy gói hiện hành và KHÔNG có nút nào để rồi nhận 403 —
 * lịch sử (endpoint đòi `platform.billing.manage`) cũng không được gọi.
 */
const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => permissions.granted.has(p),
    hasAny: (...keys: string[]) => keys.some((k) => permissions.granted.has(k)),
    isLoading: false,
  }),
}));

const hooks = vi.hoisted(() => ({ historyTenantId: undefined as string | null | undefined }));
vi.mock('../hooks/use-plans', () => ({
  useTenantSubscriptions: (tenantId: string | null) => {
    hooks.historyTenantId = tenantId;
    return { isLoading: false, isError: false, data: { items: [] }, refetch: vi.fn() };
  },
  usePlans: () => ({ data: [], isLoading: false }),
}));
vi.mock('../hooks/use-plan-mutations', () => ({
  useAssignSubscription: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelSubscription: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

const plan = {
  planName: 'Gói nâng cao',
  endsAt: '2026-12-09T00:00:00.000Z',
  quota: { maxVehicles: 10, maxBranches: 3 },
} as unknown as CurrentPlan;

function renderSection() {
  return renderWithIntl(
    <App>
      <TenantPlanSection tenantId="tenant-1" currentPlan={plan} />
    </App>,
  );
}

beforeEach(() => {
  hooks.historyTenantId = undefined;
});
afterEach(() => cleanup());

describe('TenantPlanSection — chỉ đọc khi thiếu quyền quản lý gói', () => {
  it('không có quyền gói: thấy gói hiện hành, không nút nào, không gọi lịch sử', () => {
    permissions.granted = new Set([PERMISSION.PLATFORM_TENANT_VIEW]);
    renderSection();
    expect(screen.getByText('Gói nâng cao')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(hooks.historyTenantId).toBeNull();
  });

  it('có quyền gói: nút gia hạn và lịch sử như cũ', () => {
    permissions.granted = new Set([PERMISSION.PLATFORM_BILLING_MANAGE]);
    renderSection();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    expect(hooks.historyTenantId).toBe('tenant-1');
  });
});
