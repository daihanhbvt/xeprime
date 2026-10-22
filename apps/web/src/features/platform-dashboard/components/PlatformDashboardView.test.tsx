import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { FINANCE_QUEUE, financeQueueHref } from '@/features/platform-money/finance-queues';
import { PlatformDashboardView } from './PlatformDashboardView';

/**
 * Tổng quan NỀN TẢNG. Mọi vai nền tảng đều mở được trang này, nên thứ phải khoá lại là phần
 * khác nhau giữa các vai:
 *
 *  1. Mỗi ô hàng đợi chỉ có (và chỉ GỌI API) khi người xem có quyền của màn nó dẫn tới — reviewer
 *     không thấy ô tiền, finance không thấy ô bằng lái.
 *  2. Doanh thu nền tảng chỉ hiện khi server trả khối `revenue` (quyền tiền); GMV khi có `activity`.
 *  3. Câu trả lời đầu trang dựng từ CHÍNH các ô, và chỉ nói khi mọi ô đã có số.
 *  4. Phễu nói tỉ lệ so với bước trước — chỗ rơi nhiều nhất là câu người vận hành hỏi.
 */
const state = vi.hoisted(() => ({
  permissions: [] as string[],
  overview: null as unknown,
  calls: { followUps: 0, money: 0, cases: 0 },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => state.permissions.includes(p),
    hasAny: (...ps: string[]) => ps.some((p) => state.permissions.includes(p)),
    isLoading: false,
  }),
}));

vi.mock('../api', () => ({
  fetchPlatformSummary: () =>
    Promise.resolve({
      tenantTotal: 10,
      tenantsByStatus: {
        draft: 1,
        pending_review: 0,
        needs_revision: 0,
        active: 8,
        suspended: 1,
        rejected: 0,
        expired: 0,
      },
      listingActive: 25,
      listingTotal: 30,
      bookingTotal: 100,
      bookingThisMonth: 20,
      approvalPending: 3,
      approvalPendingTenant: 0,
      approvalPendingVehicle: 3,
      recentTenants: [],
    }),
  fetchPlatformOverview: () => Promise.resolve(state.overview),
}));

vi.mock('@/features/admin-follow-ups/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/admin-follow-ups/api')>()),
  fetchFollowUps: () => {
    state.calls.followUps += 1;
    return Promise.resolve({
      items: [],
      meta: { page: 1, limit: 1, total: 2, hasNext: true },
    });
  },
}));

vi.mock('@/features/platform-money/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/platform-money/api')>()),
  fetchMoneySummary: () => {
    state.calls.money += 1;
    return Promise.resolve({
      bankIn: { count: 0, amount: '0', oldestAt: null },
      holds: { count: 0, amount: '0', disputeCount: 0 },
      refunds: { count: 1, amount: '200000' },
      withdrawals: { count: 4, amount: '9000000', overdueCount: 1 },
      insurance: { count: 0, amount: '0' },
      tax: { period: '2026-10', count: 0, amount: '0', oldestPeriod: null },
    });
  },
}));

vi.mock('@/features/support-cases/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/support-cases/api')>()),
  fetchSupportCases: () => {
    state.calls.cases += 1;
    return Promise.resolve({ items: [], meta: { page: 1, limit: 1, total: 0, hasNext: false } });
  },
}));

vi.mock('@/components/chart/MoneyVolumeChart', () => ({
  MoneyVolumeChart: () => <div data-testid="gmv-chart" />,
}));
vi.mock('@/features/admin-trips/components/TripOpsDashboardPanel', () => ({
  TripOpsDashboardPanel: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

const FUNNEL = {
  registered: 10,
  withVehicle: 8,
  withListing: 4,
  withBooking: 2,
  withCompletedTrip: 1,
};
const GROWTH = {
  newCustomers: { current: 30, previous: 20 },
  newPartners: { current: 3, previous: 3 },
};

function overview(over: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date().toISOString(),
    period: '2026-10',
    activity: null,
    growth: GROWTH,
    revenue: null,
    funnel: FUNNEL,
    ...over,
  };
}

async function renderView() {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformDashboardView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.calls = { followUps: 0, money: 0, cases: 0 };
  state.overview = overview();
});

describe('Tổng quan nền tảng — theo vai', () => {
  it('REVIEWER: chỉ hàng đợi duyệt xe, không gọi API tiền/khiếu nại/chăm sóc, không GMV', async () => {
    state.permissions = [
      PERMISSION.PLATFORM_DASHBOARD_VIEW,
      PERMISSION.PLATFORM_APPROVAL_REVIEW,
      PERMISSION.PLATFORM_DRIVER_LICENCE_REVIEW,
    ];
    await renderView();

    expect(await screen.findByText('Đang chờ xử lý: 3 xe chờ duyệt.')).toBeTruthy();
    expect(state.calls.followUps).toBe(0);
    const vehicles = screen.getByText('Xe chờ duyệt').closest('a')!;
    expect(vehicles.getAttribute('href')).toBe(ROUTES.ADMIN.ROOT);

    expect(screen.queryByText('Lệnh rút chờ chuyển')).toBeNull();
    expect(screen.queryByText('Khiếu nại đang mở')).toBeNull();
    expect(state.calls.money).toBe(0);
    expect(state.calls.cases).toBe(0);

    expect(screen.queryByText('GMV')).toBeNull();
    expect(screen.queryByText('Doanh thu nền tảng')).toBeNull();
    expect(screen.queryByTestId('gmv-chart')).toBeNull();
  });

  it('FINANCE: hàng đợi tiền (lệnh rút trễ cam kết tô đỏ) + doanh thu nền tảng so cùng kỳ', async () => {
    state.permissions = [
      PERMISSION.PLATFORM_DASHBOARD_VIEW,
      PERMISSION.PLATFORM_MONEY_MANAGE,
      PERMISSION.PLATFORM_BOOKING_VIEW,
    ];
    state.overview = overview({
      activity: {
        bookings: { current: 20, previous: 16 },
        cancelled: { current: 2, previous: 1 },
        gmv: { current: '50000000', previous: '40000000' },
        series: [],
      },
      revenue: {
        serviceFee: { current: '3000000', previous: '2000000' },
        subscriptions: { current: '3000000', previous: '3000000' },
        total: { current: '6000000', previous: '5000000' },
      },
    });
    await renderView();

    const withdrawals = (await screen.findByText('Lệnh rút chờ chuyển')).closest('a')!;
    expect(withdrawals.getAttribute('href')).toBe(financeQueueHref(FINANCE_QUEUE.WITHDRAWALS));
    expect(within(withdrawals).getByText('1 trễ cam kết')).toBeTruthy();
    expect(screen.queryByText('Bằng lái chờ duyệt')).toBeNull();
    expect(state.calls.followUps).toBe(0);

    expect(await screen.findByText('Doanh thu nền tảng')).toBeTruthy();
    expect(screen.getByText('6.000.000 ₫')).toBeTruthy();
    // GMV 50tr so với 40tr cùng kỳ; doanh thu 6tr so với 5tr.
    expect(screen.getAllByText('+25%').length).toBeGreaterThan(0);
    expect(screen.getByText('+20%')).toBeTruthy();
    expect(screen.getByText('2 huỷ hoặc không đến')).toBeTruthy();
    expect(screen.getByTestId('gmv-chart')).toBeTruthy();
  });

  it('phễu: mỗi bước nói tỉ lệ so với bước trước', async () => {
    state.permissions = [PERMISSION.PLATFORM_DASHBOARD_VIEW];
    await renderView();

    expect(await screen.findByText('Phễu kích hoạt đối tác')).toBeTruthy();
    expect(screen.getByText('80% bước trước')).toBeTruthy(); // 8/10 có xe
    expect(screen.getAllByText('50% bước trước').length).toBe(3); // 4/8 · 2/4 · 1/2
  });
});
