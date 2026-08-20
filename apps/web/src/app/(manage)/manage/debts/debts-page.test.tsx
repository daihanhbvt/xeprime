import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';

import type { DebtItem } from '@/features/finance/types';

import DebtsPage from './page';

/**
 * `/manage/debts` — màn thu nợ.
 *
 * Viết cùng đợt thêm ô tìm kiếm. Điều được khoá là **hợp đồng lọc**: từ khoá và nhóm hạn đi qua
 * URL (ADR 0004) và xuống thẳng hook (lọc chạy ở SERVER, không cắt trên trang đang mở), và câu
 * chữ khi rỗng nói đúng nguyên nhân — "chưa ai nợ" khác hẳn "lọc quá tay".
 */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/debts',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as { items: DebtItem[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastFilters: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@/features/finance/hooks/use-debts', () => ({
  useDebts: (filters: Record<string, unknown>) => {
    query.lastFilters = filters;
    return query;
  },
}));

/** Hai overlay có test riêng ở feature của chúng — stub để test này chỉ nói về trang danh sách. */
vi.mock('@/features/bookings/components/BookingDetailDialog', () => ({
  BookingDetailDialog: ({ bookingId }: { bookingId: string }) => (
    <div data-testid="booking-detail">{bookingId}</div>
  ),
}));

vi.mock('@/features/payments/components/RecordPaymentModal', () => ({
  RecordPaymentModal: ({ bookingId }: { bookingId: string }) => (
    <div data-testid="record-payment">{bookingId}</div>
  ),
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

function debt(over: Partial<DebtItem> = {}): DebtItem {
  return {
    bookingId: 'B1',
    code: 'XP-001',
    customerName: 'Nguyễn Văn An',
    customerPhone: '0901234567',
    vehicleName: 'Toyota Vios 2022',
    status: 'active',
    returnAt: '2026-08-20T03:00:00.000Z',
    totalAmount: '1000000',
    paidAmount: '300000',
    surchargeTotal: '0',
    debtAmount: '700000',
    ...over,
  };
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>([PERMISSION.FINANCE_VIEW, ...permissions]);
}

function renderPage() {
  return render(
    <App>
      <DebtsPage />
    </App>,
  );
}

function lastReplacedUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.refetch.mockReset();
  query.lastFilters = undefined;
  setQuery({ data: { items: [debt()], meta: META } });
  grant(PERMISSION.PAYMENT_RECORD, PERMISSION.BOOKING_VIEW);
});

afterEach(cleanup);

describe('/manage/debts — bộ lọc ở URL', () => {
  it('đọc `q` và `filter` từ URL rồi truyền thẳng xuống hook', () => {
    nav.params = new URLSearchParams('q=51A&filter=overdue');
    renderPage();

    expect(query.lastFilters?.q).toBe('51A');
    expect(query.lastFilters?.filter).toBe('overdue');
  });

  it('gõ vào ô tìm kiếm ⇒ ghi `q` vào URL và về trang 1', async () => {
    nav.params = new URLSearchParams('filter=overdue&page=4');
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Mã đơn/), { target: { value: '51A' } });

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const url = lastReplacedUrl();
    expect(url).toContain('q=51A');
    // Nhóm hạn đang chọn phải SỐNG SÓT qua lần gõ — hai bộ lọc độc lập nhau.
    expect(url).toContain('filter=overdue');
    expect(url).not.toContain('page=');
  });

  it('"Xoá bộ lọc" xoá cả từ khoá lẫn nhóm hạn', () => {
    nav.params = new URLSearchParams('q=51A&filter=overdue');
    renderPage();

    fireEvent.click(screen.getAllByRole('button', { name: 'Xoá bộ lọc' })[0]!);

    expect(nav.replace).toHaveBeenCalled();
    const url = lastReplacedUrl();
    expect(url).toContain('/manage/debts');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('filter=');
  });

  it('không lọc gì ⇒ không có nút "Xoá bộ lọc" nào', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });
});

describe('/manage/debts — rỗng vì chưa nợ vs rỗng vì lọc', () => {
  it('không lọc và rỗng: "chưa ai còn nợ"', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có đơn nào còn nợ')).toBeTruthy();
  });

  it('đang tìm mà rỗng: đổi sang câu không-có-kết-quả', () => {
    // Nếu trang không nói cho bảng biết mình đang lọc, người thu nợ đọc "chưa ai còn nợ" và
    // đóng màn hình — trong khi thật ra chỉ là gõ nhầm biển số.
    nav.params = new URLSearchParams('q=khong-co-ai');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có khoản nợ khớp bộ lọc')).toBeTruthy();
    expect(screen.queryByText('Không có đơn nào còn nợ')).toBeNull();
  });
});

describe('/manage/debts — bảng', () => {
  it('lỗi khi chưa có dữ liệu: nút thử lại gọi refetch', () => {
    setQuery({ isError: true });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi ĐÃ có dữ liệu thì giữ bảng đang đọc', () => {
    setQuery({ isError: true, data: { items: [debt()], meta: META } });
    renderPage();

    expect(screen.getByText('Nguyễn Văn An')).toBeTruthy();
  });

  it('thanh lọc vẫn hiện cả khi đang lỗi', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByPlaceholderText(/Mã đơn/)).toBeTruthy();
  });
});
