import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FinanceSummary } from '../types';

import { FinanceEntityPanel } from './FinanceEntityPanel';

/**
 * Khối tiền nhúng trong hồ sơ một chiếc xe / một khách.
 *
 * Ba điều phải sống sót:
 *  1. **Phạm vi đi xuống tận truy vấn.** Panel ở hồ sơ xe A không được hỏi một câu không mang
 *     `vehicleId` — nếu không nó sẽ vẽ doanh thu của cả gian hàng lên hồ sơ một chiếc xe.
 *  2. **Bộ số khác nhau theo loại thực thể.** Khách không có "Chi phí"/"Lợi nhuận": chi phí gian
 *     hàng không gắn vào khách, nên hai ô đó chỉ là số 0 giả vờ mang thông tin.
 *  3. **Đường ra sổ mang đúng kỳ và chỉ kỳ** — `granularity` là chuyện của biểu đồ, sổ không hiểu.
 */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/vehicles/v1',
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

describe('FinanceEntityPanel — hồ sơ xe', () => {
  it('phạm vi xe đi xuống CẢ hai truy vấn', () => {
    render(<FinanceEntityPanel scope={{ vehicleId: 'v1' }} kind="vehicle" />);

    expect(queries.summaryScope).toEqual({ vehicleId: 'v1' });
    expect(queries.seriesScope).toEqual({ vehicleId: 'v1' });
  });

  it('xe hiện doanh thu · chi phí · lợi nhuận · số chuyến', () => {
    render(<FinanceEntityPanel scope={{ vehicleId: 'v1' }} kind="vehicle" />);

    const panel = screen.getByRole('region', { name: 'Tiền của xe này' });
    expect(within(panel).getByText('18.400.000 ₫')).toBeTruthy();
    expect(within(panel).getByText('2.100.000 ₫')).toBeTruthy();
    expect(within(panel).getByText('16.300.000 ₫')).toBeTruthy();
    expect(within(panel).getByText(/^Biên 88[.,]6%$/)).toBeTruthy();
    expect(within(panel).getByText('12')).toBeTruthy();
  });

  it('nói rõ lợi nhuận này chưa trừ khấu hao / lãi vay', () => {
    render(<FinanceEntityPanel scope={{ vehicleId: 'v1' }} kind="vehicle" />);
    expect(screen.getByText(/chưa trừ khấu hao/i)).toBeTruthy();
  });

  it('đường ra sổ mang phạm vi + kỳ + đã duyệt, KHÔNG mang độ mịn biểu đồ', () => {
    render(<FinanceEntityPanel scope={{ vehicleId: 'v1' }} kind="vehicle" />);

    const href = screen.getByText('Xem trên sổ Thu-Chi').getAttribute('href') ?? '';
    expect(href).toContain('vehicleId=v1');
    expect(href).toContain('status=approved');
    expect(href).toContain('from=2026-08-01');
    expect(href).toContain('to=2026-08-31');
    expect(href).not.toContain('granularity');
  });

  /*
   * Lối GHI, đứng cạnh lối ĐỌC.
   *
   * Phí rửa xe / vá lốp / gửi bãi không thuộc chuyến nào, nên trước đây chúng không có đường vào
   * từ hồ sơ xe. Hai khẳng định quan trọng ở đây: link mang `create=1` (mở sẵn form), và KHÔNG
   * mang kỳ đang xem — phiếu sắp ghi mặc định là hôm nay, kéo `from`/`to` sang sẽ mở ra một sổ
   * không chứa chính phiếu vừa tạo.
   */
  it('có quyền ghi: lối tạo phiếu mang xe + cờ mở form, KHÔNG mang kỳ đang xem', () => {
    render(<FinanceEntityPanel scope={{ vehicleId: 'v1' }} kind="vehicle" canCreateReceipt />);

    const href = screen.getByText('Tạo phiếu thu/chi').getAttribute('href') ?? '';
    expect(href).toContain('vehicleId=v1');
    expect(href).toContain('create=1');
    expect(href).not.toContain('from=');
    expect(href).not.toContain('status=');
  });

  it('không có quyền ghi: chỉ còn lối đọc sổ', () => {
    render(<FinanceEntityPanel scope={{ vehicleId: 'v1' }} kind="vehicle" />);

    expect(screen.queryByText('Tạo phiếu thu/chi')).toBeNull();
    expect(screen.getByText('Xem trên sổ Thu-Chi')).toBeTruthy();
  });
});

describe('FinanceEntityPanel — hồ sơ khách', () => {
  // Một khoản thu/chi gắn thẳng vào KHÁCH không tồn tại trong sổ — tiền của khách luôn đi qua
  // một chuyến, nên lối ghi không có nghĩa ở đây kể cả khi người xem đủ quyền.
  it('khách KHÔNG có lối tạo phiếu, kể cả khi đủ quyền', () => {
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} kind="customer" canCreateReceipt />);
    expect(screen.queryByText('Tạo phiếu thu/chi')).toBeNull();
  });

  it('khách hiện doanh thu · còn nợ · số chuyến, KHÔNG hiện chi phí/lợi nhuận', () => {
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} kind="customer" />);

    const panel = screen.getByRole('region', { name: 'Doanh thu từ khách này' });
    expect(within(panel).getByText('18.400.000 ₫')).toBeTruthy();
    expect(within(panel).getByText('2.600.000 ₫')).toBeTruthy();
    // Chi phí gian hàng không gắn vào khách — hai ô này là số 0 giả vờ mang thông tin.
    expect(within(panel).queryByText('Chi phí')).toBeNull();
    expect(within(panel).queryByText('Lợi nhuận')).toBeNull();
  });

  it('nói rõ con số này khác "Tổng giá trị thuê" ở đầu hồ sơ', () => {
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} kind="customer" />);
    expect(screen.getByText(/Tổng giá trị thuê/)).toBeTruthy();
  });

  it('phạm vi khách đi xuống truy vấn', () => {
    render(<FinanceEntityPanel scope={{ tenantCustomerId: 'c1' }} kind="customer" />);
    expect(queries.summaryScope).toEqual({ tenantCustomerId: 'c1' });
  });
});

describe('FinanceEntityPanel — trạng thái', () => {
  it('lỗi tải thẻ tổng: báo lỗi thay vì hiện số rỗng như thật', () => {
    queries.summary.data = undefined;
    queries.summary.isError = true;
    render(<FinanceEntityPanel scope={{ vehicleId: 'v1' }} kind="vehicle" />);

    expect(screen.getByText('Không tải được số liệu')).toBeTruthy();
    expect(screen.queryByText('Doanh thu')).toBeNull();
  });

  it('chưa có doanh thu ⇒ biên là câu giải thích, không phải 0%', () => {
    queries.summary.data = summary({ revenue: '0', profit: '0', profitMarginPercent: null });
    render(<FinanceEntityPanel scope={{ vehicleId: 'v1' }} kind="vehicle" />);

    expect(screen.getByText('Chưa có doanh thu để tính biên')).toBeTruthy();
  });
});
