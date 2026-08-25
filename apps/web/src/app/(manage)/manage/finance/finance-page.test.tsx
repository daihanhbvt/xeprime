import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';

import type { CustomerRevenue, FinanceSummary, VehicleProfit } from '@/features/finance/types';

import FinancePage from './page';

/**
 * `/manage/finance` — Tổng quan doanh thu.
 *
 * Ba thứ phải sống sót qua mọi lần sửa, vì chúng là lý do màn này đáng tin:
 *  1. **Ba lớp tiền tách rời** — "Lợi nhuận" (của một kỳ) không được đứng lẫn với "Cọc đang giữ"
 *     (tại thời điểm này), và cọc phải nằm ngoài doanh thu (ADR 0013 §3).
 *  2. **Drill-down khớp thẻ** — mỗi đường dẫn ra sổ phải mang `sourceGroup` + `status=approved`,
 *     nếu không thẻ nói một số và danh sách nó dẫn tới nói số khác.
 *  3. **Chi phí chung không gắn xe không bốc hơi** — bảng theo xe phải nói ra phần chênh.
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/finance',
  useSearchParams: () => nav.params,
}));

const summaryQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));
const seriesQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));
const categoryQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));
const customerQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));

const vehicleQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/finance/hooks/use-finance-overview', () => ({
  useFinanceSummaryOverview: () => summaryQuery,
  useFinanceSeries: () => seriesQuery,
  useFinanceByCategory: () => categoryQuery,
  useVehicleProfit: (filters: unknown) => {
    vehicleQuery.lastFilters = filters;
    return vehicleQuery;
  },
  useCustomerRevenue: (filters: unknown) => {
    customerQuery.lastFilters = filters;
    return customerQuery;
  },
}));

/** Biểu đồ có test riêng cho ranh giới chuỗi→số; ở đây nó chỉ cần chứng minh mình được dựng. */
vi.mock('@/components/chart/RevenueTrendChart', () => ({
  RevenueTrendChart: ({ title }: { title: string }) => <figure aria-label={title} />,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

/* ------------------------------------------------------------------ dữ liệu mẫu */

function summary(over: Partial<FinanceSummary> = {}): FinanceSummary {
  return {
    totalIncome: '96500000',
    totalExpense: '24100000',
    balance: '72400000',
    revenue: '82500000',
    cost: '19300000',
    unassignedCost: '3200000',
    unassignedRevenue: '0',
    profit: '63200000',
    profitMarginPercent: 76.6,
    depositHeld: '14000000',
    depositHeldBookings: 7,
    totalDebt: '37025000',
    debtBookings: 16,
    trips: 34,
    ...over,
  };
}

function customer(over: Partial<CustomerRevenue> = {}): CustomerRevenue {
  return {
    tenantCustomerId: 'c1',
    fullName: 'Nguyễn Văn A',
    trips: 8,
    revenue: '32400000',
    sharePercent: 39.3,
    ...over,
  };
}

function vehicle(over: Partial<VehicleProfit> = {}): VehicleProfit {
  return {
    vehicleId: 'v1',
    vehicleName: 'Vios',
    plateNumber: '51A-12345',
    trips: 12,
    revenue: '18400000',
    cost: '2100000',
    profit: '16300000',
    profitMarginPercent: 88.6,
    ...over,
  };
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockClear();
  nav.push.mockClear();
  perms.granted = new Set<string>([PERMISSION.FINANCE_VIEW]);
  summaryQuery.data = summary();
  summaryQuery.isError = false;
  seriesQuery.data = { granularity: 'day', buckets: [] };
  seriesQuery.isError = false;
  categoryQuery.data = { total: '0', items: [] };
  categoryQuery.isError = false;
  vehicleQuery.data = {
    items: [vehicle()],
    meta: { page: 1, limit: 10, total: 1, hasNext: false },
  };
  vehicleQuery.isError = false;
  customerQuery.data = {
    items: [customer()],
    meta: { page: 1, limit: 10, total: 1, hasNext: false },
  };
  customerQuery.isError = false;
});

afterEach(cleanup);

function lastReplacedUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

/** Thẻ tiền là một liên kết có nhãn ở trong — tìm theo nhãn rồi leo lên thẻ `<a>` gần nhất. */
function statLink(label: string): HTMLAnchorElement {
  const el = screen.getByText(label).closest('a');
  if (!el) throw new Error(`Thẻ "${label}" không phải một liên kết`);
  return el as HTMLAnchorElement;
}

describe('/manage/finance — ba lớp tiền', () => {
  it('doanh thu KHÔNG gồm cọc, còn dòng tiền quỹ thì có', () => {
    render(<FinancePage />);

    const business = screen.getByRole('region', { name: 'Kết quả kinh doanh' });
    expect(within(business).getByText('82.500.000 ₫')).toBeTruthy();

    const cash = screen.getByRole('region', { name: 'Dòng tiền quỹ' });
    expect(within(cash).getByText('96.500.000 ₫')).toBeTruthy();
  });

  it('cọc đang giữ và công nợ nằm ở lớp "tại thời điểm này", tách khỏi số liệu kỳ', () => {
    render(<FinancePage />);

    const now = screen.getByRole('region', { name: 'Tại thời điểm này' });
    expect(within(now).getByText('14.000.000 ₫')).toBeTruthy();
    expect(within(now).getByText('37.025.000 ₫')).toBeTruthy();
    expect(within(now).getByText('Hai số này không phụ thuộc kỳ đã chọn.')).toBeTruthy();
  });

  it('chưa có doanh thu ⇒ nói "chưa có để tính biên", KHÔNG hiện 0%', () => {
    summaryQuery.data = summary({ revenue: '0', profit: '-300000', profitMarginPercent: null });
    render(<FinancePage />);

    expect(screen.getByText('Chưa có doanh thu để tính biên')).toBeTruthy();
    expect(screen.queryByText('Biên 0%')).toBeFalsy();
  });

  it('nói rõ lợi nhuận này CHƯA trừ khấu hao và lãi vay', () => {
    render(<FinancePage />);
    expect(screen.getByText(/chưa trừ khấu hao/i)).toBeTruthy();
  });
});

describe('/manage/finance — drill-down phải khớp thẻ', () => {
  it('thẻ Doanh thu dẫn tới sổ đã lọc theo nhóm nguồn + đã duyệt + đúng kỳ', () => {
    nav.params = new URLSearchParams('from=2026-08-01&to=2026-08-31');
    render(<FinancePage />);

    const business = screen.getByRole('region', { name: 'Kết quả kinh doanh' });
    const href = within(business).getByText('Doanh thu').closest('a')?.getAttribute('href') ?? '';
    expect(href).toContain('/manage/receipts');
    expect(href).toContain('type=income');
    // Thiếu hai tham số này là thẻ nói 82,5tr còn sổ cộng ra 96,5tr.
    expect(href).toContain('sourceGroup=business');
    expect(href).toContain('status=approved');
    expect(href).toContain('from=2026-08-01');
    expect(href).toContain('to=2026-08-31');
  });

  it('thẻ Tiền vào KHÔNG lọc nhóm nguồn — nó cố ý gồm cả cọc', () => {
    render(<FinancePage />);

    const href = statLink('Tiền vào').getAttribute('href') ?? '';
    expect(href).toContain('type=income');
    expect(href).not.toContain('sourceGroup');
  });

  it('thẻ Cọc đang giữ dẫn tới đúng nhóm tiền giữ hộ', () => {
    render(<FinancePage />);
    expect(statLink('Cọc đang giữ').getAttribute('href')).toContain('sourceGroup=held_funds');
  });

  it('thẻ Khách còn nợ dẫn sang màn Công nợ, không phải sổ Thu-Chi', () => {
    render(<FinancePage />);
    expect(statLink('Khách còn nợ').getAttribute('href')).toBe('/manage/debts');
  });
});

describe('/manage/finance — kỳ và bảng theo xe', () => {
  it('bấm một kỳ dựng sẵn ghi from/to lên URL, không đẻ tham số thứ hai', () => {
    render(<FinancePage />);

    fireEvent.click(screen.getByText('Tháng trước'));

    const url = lastReplacedUrl();
    expect(url).toContain('from=');
    expect(url).toContain('to=');
    expect(url).not.toContain('period=');
  });

  it('URL trống vẫn có kỳ mặc định — biểu đồ không bao giờ chạy với khoảng rỗng', () => {
    render(<FinancePage />);

    const filters = vehicleQuery.lastFilters as { from?: string; to?: string };
    expect(filters.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filters.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('chi phí chung chưa gắn xe được nói ra, không lặng lẽ biến mất', () => {
    render(<FinancePage />);
    expect(screen.getByText(/Chi phí chung chưa gắn xe: 3\.200\.000 ₫/)).toBeTruthy();
  });

  it('không có chi phí chung thì không hiện dòng chú thích thừa', () => {
    summaryQuery.data = summary({ unassignedCost: '0' });
    render(<FinancePage />);
    expect(screen.queryByText(/Chi phí chung chưa gắn xe/)).toBeFalsy();
  });

  it('xe có chuyến nhưng chưa có doanh thu vẫn hiện, biên là — chứ không phải 0%', () => {
    vehicleQuery.data = {
      items: [vehicle({ revenue: '0', cost: '0', profit: '0', profitMarginPercent: null })],
      meta: { page: 1, limit: 10, total: 1, hasNext: false },
    };
    render(<FinancePage />);

    const table = screen.getByRole('region', { name: 'Hiệu quả theo xe' });
    expect(within(table).getByText('Vios')).toBeTruthy();
    // Biên rỗng là — chứ không phải 0%: xe chưa có doanh thu khác hẳn xe hoà vốn.
    expect(within(table).queryByText('0%')).toBeFalsy();
  });
});

describe('/manage/finance — quyền', () => {
  it('thiếu finance.view ⇒ thay TOÀN BỘ nội dung bằng màn báo thiếu quyền', () => {
    perms.granted = new Set<string>();
    render(<FinancePage />);

    expect(screen.getByText('Không có quyền xem số liệu tài chính')).toBeTruthy();
    expect(screen.queryByText('Kết quả kinh doanh')).toBeFalsy();
    expect(screen.queryByRole('region', { name: 'Hiệu quả theo xe' })).toBeFalsy();
  });
});

describe('/manage/finance — doanh thu theo khách', () => {
  it('dựng bảng khách với doanh thu và tỷ trọng', () => {
    render(<FinancePage />);

    const table = screen.getByRole('region', { name: 'Doanh thu theo khách' });
    expect(within(table).getByText('Nguyễn Văn A')).toBeTruthy();
    expect(within(table).getByText('32.400.000 ₫')).toBeTruthy();
    expect(within(table).getByText(/39[.,]3%/)).toBeTruthy();
  });

  it('doanh thu chưa gắn khách được nói ra, không lặng lẽ biến mất', () => {
    summaryQuery.data = summary({ unassignedRevenue: '900000' });
    render(<FinancePage />);

    expect(screen.getByText(/Chưa gắn khách nào: 900\.000 ₫/)).toBeTruthy();
  });

  it('không có phần chưa gắn khách thì không hiện dòng chú thích thừa', () => {
    render(<FinancePage />);
    expect(screen.queryByText(/Chưa gắn khách nào/)).toBeFalsy();
  });

  it('tỷ trọng rỗng hiện — chứ không phải 0%', () => {
    customerQuery.data = {
      items: [customer({ revenue: '0', sharePercent: null })],
      meta: { page: 1, limit: 10, total: 1, hasNext: false },
    };
    render(<FinancePage />);

    const table = screen.getByRole('region', { name: 'Doanh thu theo khách' });
    expect(within(table).queryByText('0%')).toBeFalsy();
  });

  /**
   * Hai bảng trên cùng một trang phải phân trang ĐỘC LẬP. Dùng chung `page` thì bấm sang trang ở
   * bảng khách sẽ kéo luôn bảng xe sang trang, và ngược lại.
   */
  it('bảng khách mang tham số phân trang riêng, không đụng bảng xe', () => {
    nav.params = new URLSearchParams('page=3&customerPage=2');
    render(<FinancePage />);

    const vehicleFilters = vehicleQuery.lastFilters as { page?: number; customerPage?: number };
    const customerFilters = customerQuery.lastFilters as { page?: number; customerPage?: number };
    expect(vehicleFilters.page).toBe(3);
    expect(customerFilters.customerPage).toBe(2);
  });
});
