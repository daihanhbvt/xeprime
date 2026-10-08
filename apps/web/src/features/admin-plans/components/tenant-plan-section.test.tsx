import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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

const hooks = vi.hoisted(() => ({
  historyTenantId: undefined as string | null | undefined,
  liveTenantId: undefined as string | null | undefined,
  items: [] as Array<Record<string, unknown>>,
  plans: [] as unknown[],
}));
vi.mock('../hooks/use-plans', () => ({
  useTenantSubscriptions: (tenantId: string | null) => {
    hooks.historyTenantId = tenantId;
    return {
      isLoading: false,
      isError: false,
      data: { items: hooks.items, meta: { page: 1, limit: 20, total: hooks.items.length } },
      refetch: vi.fn(),
    };
  },
  // Chuỗi kỳ còn hạn đến từ endpoint riêng (`state=live`) — giả lập đúng như server lọc.
  useLiveSubscriptions: (tenantId: string | null) => {
    hooks.liveTenantId = tenantId;
    return {
      isLoading: false,
      isError: false,
      data: hooks.items.filter(
        (item) => item.status === 'active' && new Date(item.endsAt as string).getTime() > Date.now(),
      ),
      refetch: vi.fn(),
    };
  },
  usePlans: () => ({ data: hooks.plans, isLoading: false }),
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
  hooks.liveTenantId = undefined;
  hooks.items = [];
  hooks.plans = [];
});
afterEach(() => cleanup());

describe('TenantPlanSection — chỉ đọc khi thiếu quyền quản lý gói', () => {
  it('không có quyền gói: thấy gói hiện hành, không nút nào, không gọi lịch sử', () => {
    permissions.granted = new Set([PERMISSION.PLATFORM_TENANT_VIEW]);
    renderSection();
    expect(screen.getByText('Gói nâng cao')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(hooks.historyTenantId).toBeNull();
    expect(hooks.liveTenantId).toBeNull();
  });

  it('có quyền gói: nút gia hạn và lịch sử như cũ', () => {
    permissions.granted = new Set([PERMISSION.PLATFORM_BILLING_MANAGE]);
    renderSection();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    expect(hooks.historyTenantId).toBe('tenant-1');
  });
});

/** Một dòng thuê bao; mốc thời gian tương đối với "bây giờ" để test không hết hạn theo lịch. */
function sub(over: Record<string, unknown>) {
  return {
    id: 's',
    tenantId: 'tenant-1',
    planId: 'p-basic',
    planCode: 'shop-basic',
    planName: 'Gói cơ bản',
    status: 'active',
    price: '250000',
    termMonths: 3,
    quota: { maxVehicles: 3, maxBranches: 1, maxMembers: null },
    billingMode: 'package',
    commissionPercent: null,
    note: null,
    origin: 'admin',
    createdAt: new Date().toISOString(),
    ...over,
  };
}

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

describe('TenantPlanSection — mỗi lúc chỉ MỘT kỳ hiệu lực', () => {
  beforeEach(() => {
    permissions.granted = new Set([PERMISSION.PLATFORM_BILLING_MANAGE]);
    hooks.items = [
      sub({
        id: 'next',
        planId: 'p-adv',
        planName: 'Gói nâng cao',
        termMonths: 1,
        startsAt: at(90),
        endsAt: at(121),
        // Trạng thái KỲ do server chấm — client không tự chấm.
        termState: 'scheduled',
      }),
      sub({ id: 'cur', startsAt: at(-2), endsAt: at(90), termState: 'current' }),
      sub({
        id: 'old',
        planName: 'Tuyến hoa hồng mặc định',
        billingMode: 'commission',
        status: 'cancelled',
        price: '0',
        startsAt: at(-5),
        endsAt: at(360),
        termState: 'cancelled',
        origin: 'system',
      }),
    ];
  });

  it('kỳ nối đuôi là "Chờ đến kỳ", không phải một gói thứ hai "Đang hiệu lực"', () => {
    renderSection();
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByText('Chờ đến kỳ')).toBeTruthy();
    expect(within(rows[1]!).getByText('Đang hiệu lực')).toBeTruthy();
    expect(within(rows[2]!).getByText('Đã huỷ')).toBeTruthy();
    // Thẻ tóm tắt: kỳ đang chạy + kỳ kế tiếp.
    expect(screen.getByText('Kỳ kế tiếp · đã xếp lịch')).toBeTruthy();
  });

  it('chỉ huỷ được kỳ cuối chuỗi: kỳ xếp lịch có "Huỷ lịch", kỳ đang chạy thì không', () => {
    renderSection();
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByRole('button', { name: 'Huỷ lịch' })).toBeTruthy();
    expect(within(rows[1]!).queryByRole('button')).toBeNull();
    expect(within(rows[2]!).queryByRole('button')).toBeNull();
  });

  it('dòng hệ thống nói nguồn gốc bằng nhãn dịch được, không phải ghi chú lưu trong DB', () => {
    renderSection();
    expect(screen.getByText('Hệ thống gán tuyến hoa hồng mặc định')).toBeTruthy();
    expect(screen.queryByText(/ADR/)).toBeNull();
  });

  it('kỳ server chấm "đang hiệu lực" giữ nguyên dù đồng hồ client chậm hơn ngày bắt đầu', () => {
    // Kỳ vừa "đổi gói ngay": startsAt nhích sau đồng hồ client vài giây.
    hooks.items = [sub({ id: 'fresh', startsAt: at(0.0001), endsAt: at(30), termState: 'current' })];
    renderSection();
    expect(screen.getByText('Đang hiệu lực', { selector: '.ant-tag' })).toBeTruthy();
    expect(screen.queryByText('Kỳ kế tiếp · đã xếp lịch')).toBeNull();
  });

  it('hộp gia hạn nói rõ kỳ trả phí cuối cùng mà kỳ mới sẽ nối theo', () => {
    hooks.plans = [
      {
        id: 'p-adv',
        code: 'shop-advanced',
        name: 'Gói nâng cao',
        billingMode: 'package',
        commissionPercent: null,
        limits: { maxVehicles: 10, maxBranches: 3, termPrices: [{ months: 1, price: '250000' }] },
      },
    ];
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Gia hạn / đổi gói' }));
    expect(screen.getByText('Gia hạn hoặc đổi gói')).toBeTruthy();
    // Nối sau kỳ XẾP LỊCH (ends muộn nhất), không phải sau kỳ đang chạy.
    expect(screen.getByText(/Kỳ trả phí cuối cùng: Gói nâng cao/)).toBeTruthy();
  });
});
