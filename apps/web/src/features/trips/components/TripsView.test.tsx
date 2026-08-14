import { App } from 'antd';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/services/api-client';

import { TripsView } from './TripsView';

/**
 * Danh sách `Chuyến của tôi`.
 *
 * Điều được khoá: bộ lọc đọc từ URL (ADR 0004 — link gửi được, F5 không mất), và ba trạng thái
 * dễ bị gộp nhầm thành một — trống, lỗi tải, và hết phiên — có ba lối thoát khác nhau. "Thử
 * lại" cho phiên hết hạn chỉ lặp lại đúng lỗi đó.
 */
const query = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  isFetching: false,
  error: undefined as unknown,
  refetch: vi.fn(),
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn(), push: vi.fn() }));

vi.mock('../hooks', () => ({ useTrips: () => query }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => nav.params,
}));

vi.mock('@/features/auth/components/AuthModalProvider', () => ({
  useAuthModal: () => ({ open: vi.fn() }),
  useNextFromCurrentPath: () => () => '/trips',
}));

const TRIP = {
  id: 'RQ1',
  bookingId: 'BK1',
  code: 'XP-0042',
  stage: 'active',
  vehicle: {
    id: 'V1',
    name: 'Toyota Camry 2024',
    imageUrl: null,
    seatCount: 5,
    transmission: null,
    fuelType: null,
    plateNumber: '43A-123.45',
  },
  shop: {
    name: 'Gian hàng Minh Tuấn',
    slug: 'minh-tuan',
    ratingAvg: 4.8,
    ratingCount: 12,
    phone: null,
  },
  pickupAt: '2026-08-09T14:00:00.000Z',
  returnAt: '2026-08-12T14:00:00.000Z',
  deliveryRequested: true,
  deliveryAddress: '123 Nguyễn Văn Linh',
  totalAmount: '2772000.00',
  canReview: false,
  hasReview: false,
  createdAt: '2026-08-01T00:00:00.000Z',
};

const COUNTS = { all: 4, pending: 1, upcoming: 1, active: 1, completed: 1, cancelled: 0 };

beforeEach(() => {
  query.data = {
    items: [TRIP],
    meta: { page: 1, limit: 10, total: 1, hasNext: false },
    counts: COUNTS,
  };
  query.isLoading = false;
  query.isError = false;
  query.isFetching = false;
  query.error = undefined;
  nav.params = new URLSearchParams();
  nav.replace.mockClear();
});

afterEach(cleanup);

function renderView() {
  return render(
    <App>
      <TripsView />
    </App>,
  );
}

describe('Danh sách chuyến', () => {
  it('tab hiện số của SERVER, không phải số chuyến trong trang hiện tại', () => {
    renderView();
    // Trang chỉ có 1 thẻ nhưng tab `Tất cả` phải nói 4 — đếm ở client là sai ngay khi có
    // nhiều hơn một trang.
    expect(screen.getByText('Tất cả (4)')).toBeTruthy();
    expect(screen.getByText('Hoàn thành (1)')).toBeTruthy();
  });

  it('thẻ chuyến hiện tổng tiền và cách nhận xe', () => {
    renderView();
    expect(screen.getByText('Toyota Camry 2024')).toBeTruthy();
    expect(screen.getByText('Giao xe tận nơi')).toBeTruthy();
    expect(screen.getByText(/2\.772\.000/)).toBeTruthy();
  });

  it('chuyến chưa có giá chốt nói `Chờ báo giá`, không hiện 0 đ', () => {
    query.data = {
      items: [{ ...TRIP, id: 'RQ2', stage: 'pending_approval', totalAmount: null }],
      meta: { page: 1, limit: 10, total: 1, hasNext: false },
      counts: COUNTS,
    };
    renderView();
    expect(screen.getByText('Chờ báo giá')).toBeTruthy();
    expect(screen.queryByText(/^0\s*₫/)).toBeNull();
  });

  it('đọc tab đang mở từ URL', () => {
    nav.params = new URLSearchParams('filter=completed');
    renderView();
    // Tab đang chọn phải là `Hoàn thành`, không phải mặc định `Tất cả`.
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Hoàn thành');
  });

  it('danh sách trống mời đi tìm xe', () => {
    query.data = {
      items: [],
      meta: { page: 1, limit: 10, total: 0, hasNext: false },
      counts: COUNTS,
    };
    renderView();
    expect(screen.getByText('Bạn chưa có chuyến đi nào')).toBeTruthy();
  });

  it('lỗi tải cho thử lại', () => {
    query.isError = true;
    query.error = new ApiClientError({ code: 'INTERNAL', message: 'Sập mạng', status: 500 });
    renderView();
    expect(screen.getByText('Không tải được danh sách chuyến')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('hết phiên mời ĐĂNG NHẬP, không mời thử lại', () => {
    query.isError = true;
    query.error = new ApiClientError({
      code: 'UNAUTHENTICATED',
      message: 'Hết phiên',
      status: 401,
    });
    renderView();
    expect(screen.getByText('Phiên đăng nhập đã hết hạn')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  /**
   * Wave 11.1 — `<Button>` lồng trong `<Link>` cho trình đọc màn hình hai đích cho cùng một
   * hành động, và bàn phím phải Tab hai lần để đi qua nó.
   */
  it('hành động "Xem chi tiết" là MỘT liên kết, không phải nút lồng trong liên kết', () => {
    renderView();
    const link = screen.getByRole('link', { name: 'Xem chi tiết' });
    expect(link.getAttribute('href')).toBe('/trips/RQ1');
    expect(link.querySelector('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xem chi tiết' })).toBeNull();
  });

  it('đang tải lần đầu thì báo bận, không hiện "chưa có chuyến nào"', () => {
    query.isLoading = true;
    query.data = undefined;
    renderView();
    expect(screen.queryByText('Bạn chưa có chuyến đi nào')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
