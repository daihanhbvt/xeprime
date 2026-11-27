import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FinanceSummary } from '../types';

import { FinanceEntityPanel } from './FinanceEntityPanel';

/**
 * Khối tiền nhúng trong hồ sơ một khách (hồ sơ xe có tab riêng - `VehicleFinanceTab`).
 *
 * Ba điều phải sống sót:
 *  1. **Phạm vi đi xuống tận truy vấn.** Panel ở hồ sơ khách A không được hỏi một câu không mang
 *     `tenantCustomerId` — nếu không nó sẽ vẽ doanh thu của cả gian hàng lên hồ sơ một khách.
 *  2. **Bộ số của khách.** Khách không có "Chi phí"/"Lợi nhuận": chi phí gian hàng không gắn vào
 *     khách, nên hai ô đó chỉ là số 0 giả vờ mang thông tin.
 *  3. **Đường ra sổ mang đúng kỳ và chỉ kỳ** — `granularity` là chuyện của biểu đồ, sổ không hiểu.
 */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/customers/c1',
  useSearchParams: () => nav.params,
}));

const queries = vi.hoisted(() => ({
  summary: {
    data: undefined as unknown,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  series: {
    data: { granularity: 'day', buckets: [] } as unknown,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  summaryScope: undefined as unknown,
  seriesScope: undefined as unknown,
}));

vi.mock('../hooks/use-finance-overview', () => ({
  useFinanceSummaryOverview: (_filters: unknown, scope: unknown) => {
    queries.summaryScope = scope;
    return queries.summary;
  },
  useFinanceSeries: (_filters: unknown, scope: unknown) => {
    queries.seriesScope = scope;
    return queries.series;
  },
}));

/** Biểu đồ có test riêng cho ranh giới chuỗi→số; ở đây chỉ cần nó không kéo recharts vào jsdom. */
vi.mock('@/components/chart/RevenueTrendChart', () => ({
  RevenueTrendChart: ({ title }: { title: string }) => <figure aria-label={title} />,
}));

function summary(over: Partial<FinanceSummary> = {}): FinanceSummary {
  return {
    totalIncome: '20000000',
    totalExpense: '3000000',
    balance: '17000000',
    revenue: '18400000',
    cost: '2100000',
    unassignedCost: '0',
    unassignedRevenue: '0',
    profit: '16300000',
    profitMarginPercent: 88.6,
    depositHeld: '0',
    depositHeldBookings: 0,
    totalDebt: '2600000',
    debtBookings: 1,
    trips: 12,
    ...over,
  };
}

beforeEach(() => {
  nav.params = new URLSearchParams('from=2026-08-01&to=2026-08-31&granularity=day');
  nav.replace.mockClear();
  queries.summary.data = summary();
  queries.summary.isError = false;
  queries.series.data = { granularity: 'day', buckets: [] };
  queries.series.isError = false;
});

afterEach(cleanup);

describe('FinanceEntityPanel - hồ sơ khách', () => {
  // Một khoản thu/chi gắn thẳng vào KHÁCH không tồn tại trong sổ — tiền của khách luôn đi qua
  // một chuyến, nên lối ghi không có nghĩa ở đây.
  it('khách KHÔNG có lối tạo phiếu', () => {
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} />);
    expect(screen.queryByText('Tạo phiếu thu/chi')).toBeNull();
  });

  it('khách hiện doanh thu · còn nợ · số chuyến, KHÔNG hiện chi phí/lợi nhuận', () => {
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} />);

    const panel = screen.getByRole('region', { name: 'Doanh thu từ khách này' });
    expect(within(panel).getByText('18.400.000 ₫')).toBeTruthy();
    expect(within(panel).getByText('2.600.000 ₫')).toBeTruthy();
    // Chi phí gian hàng không gắn vào khách — hai ô này là số 0 giả vờ mang thông tin.
    expect(within(panel).queryByText('Chi phí')).toBeNull();
    expect(within(panel).queryByText('Lợi nhuận')).toBeNull();
  });

  it('nói rõ con số này khác "Tổng giá trị thuê" ở đầu hồ sơ', () => {
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} />);
    expect(screen.getByText(/Tổng giá trị thuê/)).toBeTruthy();
  });

  it('phạm vi khách đi xuống truy vấn', () => {
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} />);
    expect(queries.summaryScope).toEqual({ tenantCustomerId: 'c1' });
  });
});

describe('FinanceEntityPanel - trạng thái', () => {
  it('lỗi tải thẻ tổng: báo lỗi thay vì hiện số rỗng như thật', () => {
    queries.summary.data = undefined;
    queries.summary.isError = true;
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} />);

    expect(screen.getByText('Không tải được số liệu')).toBeTruthy();
    expect(screen.queryByText('Doanh thu')).toBeNull();
  });
});
