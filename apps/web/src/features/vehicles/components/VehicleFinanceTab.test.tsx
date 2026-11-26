import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceSourceBreakdown, FinanceSummary } from '@/features/finance/types';
import type { VehicleDetail } from '../types';
import { VehicleFinanceTab } from './VehicleFinanceTab';

/**
 * Tab Tài chính của hồ sơ xe.
 *
 * Điều phải sống sót:
 *  1. Phạm vi `vehicleId` đi xuống MỌI truy vấn - không thì vẽ tiền cả gian hàng lên một xe.
 *  2. Chọn nguồn chỉ đổi phần DOANH THU; chi phí và lợi nhuận luôn là của cả xe.
 *  3. Góc nhìn nguồn nằm trên URL (`revenueSource`), gửi đường dẫn là gửi đúng màn.
 *  4. Đường ra sổ mang đúng kỳ; lối tạo phiếu không mang kỳ.
 */

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => '/manage/vehicles/v1',
  useSearchParams: () => nav.params,
}));

const q = vi.hoisted(() => ({
  summary: { data: undefined as unknown, isFetching: false, isError: false, refetch: vi.fn() },
  series: {
    data: { granularity: 'day', buckets: [] } as unknown,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  bySource: { data: undefined as unknown, isFetching: false, isError: false, refetch: vi.fn() },
  previous: { data: undefined as unknown, isFetching: false, isError: false, refetch: vi.fn() },
  costs: {
    data: { total: '2100000', items: [] } as unknown,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  scopes: [] as unknown[],
  bySourceCalls: [] as { filters: { from?: string; to?: string }; enabled: boolean }[],
}));

vi.mock('@/features/finance/hooks/use-finance-overview', () => ({
  useFinanceSummaryOverview: (_f: unknown, scope: unknown) => {
    q.scopes.push(scope);
    return q.summary;
  },
  useFinanceSeries: (_f: unknown, scope: unknown) => {
    q.scopes.push(scope);
    return q.series;
  },
  useFinanceByCategory: (_f: unknown, _type: unknown, scope: unknown) => {
    q.scopes.push(scope);
    return q.costs;
  },
  useFinanceBySource: (filters: { from?: string; to?: string }, scope: unknown, enabled = true) => {
    q.scopes.push(scope);
    q.bySourceCalls.push({ filters, enabled });
    // Lượt gọi thứ hai của mỗi render là kỳ so sánh.
    return q.bySourceCalls.length % 2 === 1 ? q.bySource : q.previous;
  },
}));

vi.mock('@/components/chart/SourceRevenueTrendChart', () => ({
  SourceRevenueTrendChart: ({ title, highlight }: { title: string; highlight: string | null }) => (
    <figure aria-label={title} data-highlight={highlight ?? 'none'} />
  ),
  SourceRevenueTrendLegend: () => null,
}));

vi.mock('./VehicleCapitalCard', () => ({
  VehicleCapitalCard: () => <div data-testid="capital-card" />,
}));

const vehicle = { id: 'v1', sourceType: 'owned' } as unknown as VehicleDetail;

function summary(over: Partial<FinanceSummary> = {}): FinanceSummary {
  return {
    totalIncome: '20000000',
    totalExpense: '3000000',
    balance: '17000000',
    revenue: '1500000',
    cost: '2100000',
    unassignedCost: '0',
    unassignedRevenue: '0',
    profit: '-600000',
    profitMarginPercent: -40,
    depositHeld: '5000000',
    depositHeldBookings: 1,
    totalDebt: '1200000',
    debtBookings: 1,
    trips: 4,
    ...over,
  };
}

const breakdown: FinanceSourceBreakdown = {
  total: '1500000',
  marketplaceAmount: '500000',
  directAmount: '700000',
  unlinkedAmount: '300000',
  items: [
    {
      source: 'xeprime',
      sourceLabel: null,
      amount: '500000',
      sharePercent: 33.3,
      trips: 2,
      bookedAmount: '900000',
    },
    {
      source: 'social',
      sourceLabel: null,
      amount: '700000',
      sharePercent: 46.7,
      trips: 1,
      bookedAmount: '1000000',
    },
    {
      source: 'other_platform',
      sourceLabel: 'Nền tảng A',
      amount: '0',
      sharePercent: 0,
      trips: 1,
      bookedAmount: '400000',
    },
    {
      source: null,
      sourceLabel: null,
      amount: '300000',
      sharePercent: 20,
      trips: 0,
      bookedAmount: '0',
    },
  ],
};

beforeEach(() => {
  nav.params = new URLSearchParams('from=2026-08-01&to=2026-08-31&granularity=day');
  nav.replace.mockClear();
  q.summary.data = summary();
  q.summary.isError = false;
  q.bySource.data = breakdown;
  q.bySource.isError = false;
  q.previous.data = { ...breakdown, total: '1000000', marketplaceAmount: '400000' };
  q.scopes = [];
  q.bySourceCalls = [];
});

afterEach(cleanup);

function renderTab(props: Partial<{ canCreateReceipt: boolean; showCapital: boolean }> = {}) {
  return render(
    <VehicleFinanceTab
      vehicle={vehicle}
      canCreateReceipt={props.canCreateReceipt ?? false}
      showCapital={props.showCapital ?? true}
    />,
  );
}

describe('VehicleFinanceTab - phạm vi và kỳ', () => {
  it('mọi truy vấn mang vehicleId; kỳ so sánh là cùng kỳ trước', () => {
    renderTab();
    expect(q.scopes.length).toBeGreaterThanOrEqual(5);
    expect(q.scopes.every((scope) => JSON.stringify(scope) === '{"vehicleId":"v1"}')).toBe(true);
    // Tháng 8 đã qua ⇒ so với trọn tháng 7.
    const previous = q.bySourceCalls[1];
    expect(previous?.enabled).toBe(true);
    expect(previous?.filters).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('đường ra sổ mang phạm vi + kỳ + đã duyệt, KHÔNG mang độ mịn', () => {
    renderTab();
    const href = screen.getByText('Xem sổ Thu-Chi').getAttribute('href') ?? '';
    expect(href).toContain('vehicleId=v1');
    expect(href).toContain('status=approved');
    expect(href).toContain('from=2026-08-01');
    expect(href).toContain('to=2026-08-31');
    expect(href).not.toContain('granularity');
  });

  it('có quyền ghi: lối tạo phiếu mang xe + cờ mở form, KHÔNG mang kỳ', () => {
    renderTab({ canCreateReceipt: true });
    const href = screen.getByText('Tạo phiếu thu/chi').getAttribute('href') ?? '';
    expect(href).toContain('vehicleId=v1');
    expect(href).toContain('create=1');
    expect(href).not.toContain('from=');
  });

  it('không có quyền ghi: không có lối tạo phiếu', () => {
    renderTab();
    expect(screen.queryByText('Tạo phiếu thu/chi')).toBeNull();
  });
});

describe('VehicleFinanceTab - ô số', () => {
  it('tất cả nguồn: doanh thu tổng, chi phí, lợi nhuận, công nợ + cọc', () => {
    renderTab();
    expect(screen.getAllByText('1.500.000 ₫').length).toBeGreaterThan(0);
    expect(screen.getByText('2.100.000 ₫')).toBeTruthy();
    expect(screen.getByText('-600.000 ₫')).toBeTruthy();
    expect(screen.getByText('1.200.000 ₫')).toBeTruthy();
    expect(screen.getByText(/1 đơn còn nợ · Cọc giữ 5\.000\.000 ₫/)).toBeTruthy();
    // 4 chuyến · TB 375.000 ₫ - cộng từ chính các dòng nguồn.
    expect(screen.getByText(/4 chuyến · TB 375\.000 ₫\/chuyến/)).toBeTruthy();
    // So với cùng kỳ trước: 1,5tr so với 1tr ⇒ +50%.
    expect(screen.getByText(/\+50%/)).toBeTruthy();
  });

  it('chưa có doanh thu ⇒ biên là câu giải thích, không phải 0%', () => {
    q.summary.data = summary({ revenue: '0', profit: '0', profitMarginPercent: null });
    renderTab();
    expect(screen.getByText('Chưa có doanh thu để tính biên')).toBeTruthy();
  });

  it('lỗi tải thẻ tổng: báo lỗi thay vì số rỗng', () => {
    q.summary.data = undefined;
    q.summary.isError = true;
    renderTab();
    expect(screen.getByText('Không tải được số liệu')).toBeTruthy();
  });
});

describe('VehicleFinanceTab - chọn nguồn', () => {
  it('bấm thẻ "Qua sàn" ghi revenueSource=xeprime lên URL', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Qua sàn XePrime/ }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(String(nav.replace.mock.calls[0]?.[0])).toContain('revenueSource=xeprime');
  });

  it('nguồn ngoài: đổi doanh thu + dòng nguồn, giữ chi phí và lợi nhuận của cả xe', () => {
    nav.params = new URLSearchParams('from=2026-08-01&to=2026-08-31&revenueSource=direct');
    renderTab();

    expect(screen.getByText('Doanh thu nguồn ngoài')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nguồn ngoài/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // Lợi nhuận vẫn của cả xe - không phải 700.000 − 2.100.000.
    expect(screen.getByText('-600.000 ₫')).toBeTruthy();
    expect(screen.getByLabelText('Doanh thu theo nguồn & lợi nhuận').dataset.highlight).toBe(
      'direct',
    );

    const rows = screen.getByRole('region', { name: /Chi tiết doanh thu từng nguồn/ });
    expect(within(rows).getByText('Nền tảng A')).toBeTruthy();
    expect(within(rows).queryByText('Thu không gắn đơn')).toBeNull();
    expect(within(rows).queryByText('Phiếu lẻ')).toBeNull();
  });

  it('giá trị URL lạ ⇒ "tất cả nguồn"', () => {
    nav.params = new URLSearchParams('from=2026-08-01&to=2026-08-31&revenueSource=hack');
    renderTab();
    expect(screen.getByRole('button', { name: /Tất cả nguồn/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('VehicleFinanceTab - kỳ "Toàn bộ" và độ mịn', () => {
  it('chọn "Toàn bộ": xoá from/to, ghi period=all_time và độ mịn tháng trong MỘT lượt', () => {
    renderTab();
    fireEvent.click(screen.getByText('Toàn bộ'));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = new URL(String(nav.replace.mock.calls[0]?.[0]), 'http://x');
    expect(url.searchParams.get('period')).toBe('all_time');
    expect(url.searchParams.get('from')).toBeNull();
    expect(url.searchParams.get('to')).toBeNull();
    expect(url.searchParams.get('granularity')).toBe('month');
  });

  it('URL period=all_time: truy vấn không mang kỳ, không so cùng kỳ, sổ mở không lọc ngày', () => {
    nav.params = new URLSearchParams('period=all_time&from=2026-08-01&to=2026-08-31');
    renderTab();
    const current = q.bySourceCalls[0];
    expect(current?.filters.from).toBeUndefined();
    expect(current?.filters.to).toBeUndefined();
    // Truy vấn kỳ so sánh bị tắt và không có huy hiệu so sánh.
    expect(q.bySourceCalls[1]?.enabled).toBe(false);
    expect(screen.queryByText(/so với cùng kỳ trước/)).toBeNull();
    const href = screen.getByText('Xem sổ Thu-Chi').getAttribute('href') ?? '';
    expect(href).not.toContain('from=');
  });

  it('chọn "Năm nay": độ mịn chuyển sang tháng (không để 53 cột tuần)', () => {
    renderTab();
    fireEvent.click(screen.getByText('Năm nay'));
    const url = new URL(String(nav.replace.mock.calls[0]?.[0]), 'http://x');
    expect(url.searchParams.get('granularity')).toBe('month');
    expect(url.searchParams.get('period')).toBeNull();
    expect(url.searchParams.get('from')).toMatch(/^\d{4}-01-01$/);
  });
});

describe('VehicleFinanceTab - nguồn vốn', () => {
  it('chỉ dựng thẻ nguồn vốn khi được phép', () => {
    renderTab({ showCapital: false });
    expect(screen.queryByTestId('capital-card')).toBeNull();
    cleanup();
    renderTab({ showCapital: true });
    expect(screen.getByTestId('capital-card')).toBeTruthy();
  });
});
