import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, TENANT_CUSTOMER_RISK_LEVEL } from '@xeprime/types';
import CustomersPage from './page';
import type { TenantCustomer, TenantCustomerSummary } from '@/features/customers/types';

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/customers',
  useSearchParams: () => nav.params,
}));

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => layout.mobile,
  useIsTablet: () => false,
  useIsDesktop: () => !layout.mobile,
  useMediaQuery: () => false,
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const queries = vi.hoisted(() => ({
  list: {
    data: undefined as { items: TenantCustomer[]; meta: unknown } | undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  summary: { data: undefined as TenantCustomerSummary | undefined, isLoading: false },
  listEnabled: undefined as boolean | undefined,
  lastFilters: undefined as Record<string, unknown> | undefined,
}));
vi.mock('@/features/customers/hooks/use-customers', () => ({
  useCustomers: (filters: Record<string, unknown>, enabled?: boolean) => {
    queries.lastFilters = filters;
    queries.listEnabled = enabled;
    return queries.list;
  },
  useCustomerSummary: () => queries.summary,
  useCreateCustomer: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCustomer: () => ({ mutate: vi.fn(), isPending: false }),
}));

function customer(overrides: Partial<TenantCustomer> = {}): TenantCustomer {
  return {
    id: 'cus-1',
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    email: 'an@test.vn',
    riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL,
    source: 'booking',
    hasAccount: true,
    archivedAt: null,
    completedRentalCount: 6,
    activeBookingCount: 1,
    noShowCount: 0,
    lateReturnCount: 1,
    lastRentalAt: '2027-08-01T02:00:00.000Z',
    totalBookingAmount: '12750000',
    paidAmount: '10750000',
    debtAmount: '2000000',
    ...overrides,
  } as TenantCustomer;
}

const summary: TenantCustomerSummary = {
  activeCustomers: 42,
  returningCustomers: 11,
  watchlistCustomers: 2,
  blockedCustomers: 1,
  archivedCustomers: 3,
  totalDebt: '8400000',
  debtCustomers: 5,
};

function renderPage() {
  return render(
    <App>
      <CustomersPage />
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.CUSTOMER_VIEW,
    PERMISSION.CUSTOMER_MANAGE,
    PERMISSION.FINANCE_VIEW,
  ]);
  layout.mobile = false;
  nav.params = new URLSearchParams();
  nav.push.mockClear();
  nav.replace.mockClear();
  queries.list = {
    data: { items: [customer()], meta: { page: 1, limit: 20, total: 42, hasNext: true } },
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
  queries.summary = { data: summary, isLoading: false };
  queries.listEnabled = undefined;
  queries.lastFilters = undefined;
});
afterEach(cleanup);

describe('/manage/customers — sổ khách của gian hàng (S-01)', () => {
  it('KHÔNG còn là placeholder: có dải chỉ số, bộ lọc và danh sách thật', () => {
    renderPage();
    // Chuỗi của `PlaceholderPage` cũ phải biến mất hoàn toàn.
    expect(screen.queryByText('Chưa có dữ liệu')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Khách hàng' })).toBeTruthy();
    expect(screen.getByText('Khách đang hoạt động')).toBeTruthy();
    expect(screen.getByText('Nguyễn Văn An')).toBeTruthy();
  });

  it('thiếu quyền: hiện màn không có quyền và KHÔNG gọi API danh sách', () => {
    permissions.granted = new Set();
    renderPage();
    expect(screen.getByText('Bạn chưa có quyền xem sổ khách')).toBeTruthy();
    expect(queries.listEnabled).toBe(false);
  });

  it('đang tải lần đầu: hiện skeleton thay vì bảng rỗng', () => {
    queries.list = { data: undefined, isFetching: true, isError: false, refetch: vi.fn() };
    renderPage();
    expect(screen.getByText('Đang tải sổ khách của gian hàng…')).toBeTruthy();
  });

  it('lỗi tải lần đầu: hiện lỗi có nút thử lại', () => {
    const refetch = vi.fn();
    queries.list = { data: undefined, isFetching: false, isError: true, refetch };
    renderPage();
    expect(screen.getByText('Không tải được danh sách khách hàng')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('lỗi làm mới NỀN vẫn giữ dữ liệu đang đọc, không thay bằng màn lỗi', () => {
    queries.list = {
      data: { items: [customer()], meta: { page: 1, limit: 20, total: 42, hasNext: true } },
      isFetching: false,
      isError: true,
      refetch: vi.fn(),
    };
    renderPage();
    expect(screen.queryByText('Không tải được danh sách khách hàng')).toBeNull();
    expect(screen.getByText('Nguyễn Văn An')).toBeTruthy();
  });

  it('rỗng thật: mời thêm khách đầu tiên', () => {
    queries.list = {
      data: { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderPage();
    expect(screen.getByText('Sổ khách còn trống')).toBeTruthy();
  });

  it('rỗng DO LỌC: thông điệp khác hẳn rỗng thật, và có lối xoá bộ lọc', () => {
    nav.params = new URLSearchParams('q=khong-co-ai');
    queries.list = {
      data: { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderPage();
    expect(screen.getByText('Không có khách nào khớp bộ lọc')).toBeTruthy();
    expect(screen.queryByText('Sổ khách còn trống')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Xoá bộ lọc' })[0]!);
    expect(nav.replace).toHaveBeenCalled();
  });

  it('bộ lọc đọc TỪ URL và ghi NGƯỢC lên URL (ADR 0004)', () => {
    nav.params = new URLSearchParams('relationship=watchlist&sort=name&page=3');
    renderPage();
    expect(queries.lastFilters).toMatchObject({
      relationship: 'watchlist',
      sort: 'name',
      page: 3,
    });

    // Phân trang cũng đi qua URL — trang đang xem phải chia sẻ được và sống sót qua F5.
    fireEvent.click(screen.getByTitle('2'));
    expect(nav.replace).toHaveBeenCalled();
  });

  it('URL mang bộ lọc TÀI CHÍNH nhưng người dùng không có quyền tiền → rơi về mặc định, không gọi API chắc chắn 403', () => {
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW]);
    nav.params = new URLSearchParams('relationship=has_debt&sort=debt');
    renderPage();
    expect(queries.lastFilters?.relationship).toBeUndefined();
    expect(queries.lastFilters?.sort).toBeUndefined();
  });

  it('thiếu `finance.view`: ẩn hẳn cột và ô công nợ, không hiện số 0 giả', () => {
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW]);
    renderPage();
    expect(screen.queryByText('Còn nợ')).toBeNull();
    expect(screen.queryByText('Tổng giá trị')).toBeNull();
    expect(screen.queryByText(/8\.400\.000/)).toBeNull();
  });

  it('có `finance.view`: hiện công nợ ở cả KPI lẫn bảng', () => {
    renderPage();
    expect(screen.getByText(/8\.400\.000/)).toBeTruthy();
    expect(screen.getByText(/2\.000\.000/)).toBeTruthy();
  });

  it('nút "Thêm khách hàng" chỉ hiện khi có `customers.manage`', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Thêm khách hàng/ })).toBeTruthy();

    cleanup();
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW]);
    renderPage();
    expect(screen.queryByRole('button', { name: /Thêm khách hàng/ })).toBeNull();
  });

  it('mở hồ sơ: điều hướng tới route chi tiết chia sẻ được', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Xem hồ sơ' })[0]!);
    expect(nav.push).toHaveBeenCalledWith('/manage/customers/cus-1');
  });

  it('mobile: render THẺ với danh tính, nhóm chỉ số và nút xem hồ sơ (không phải bảng ép ngang)', () => {
    layout.mobile = true;
    queries.list = {
      data: {
        items: [customer({ riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED })],
        meta: { page: 1, limit: 20, total: 1, hasNext: false },
      },
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderPage();

    const card = screen.getByRole('article');
    expect(within(card).getByText('Nguyễn Văn An')).toBeTruthy();
    expect(within(card).getByText('Từ chối phục vụ')).toBeTruthy();
    expect(within(card).getByText('Số lần thuê')).toBeTruthy();
    expect(within(card).getByText('Lần cuối')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Xem hồ sơ' })).toBeTruthy();
    // Không dựng bảng desktop ở chế độ thẻ.
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('mobile + thiếu quyền tiền: thẻ không có ô công nợ', () => {
    layout.mobile = true;
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW]);
    renderPage();
    expect(within(screen.getByRole('article')).queryByText('Còn nợ')).toBeNull();
  });
});
