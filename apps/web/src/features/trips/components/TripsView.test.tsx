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

/*
 * Hai cộng tác viên của phía CHỦ XE, mock cùng kiểu với `useTrips` ở trên.
 *
 * Danh sách nay phục vụ cả hai phía (08/09/2026), nên nó hỏi quyền và cầm luồng duyệt/từ chối.
 * Bộ test này khoá hành vi DANH SÁCH — tab, bộ lọc URL, ba trạng thái rỗng/lỗi/hết phiên — nên
 * kéo cả TanStack Query vào chỉ để hai hook đó chạy thật là đổi thứ đang được kiểm.
 * Luồng quyết định có test riêng ở `features/booking-requests`.
 */
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true, hasAny: () => true, isLoading: false }),
}));

vi.mock('@/features/booking-requests/hooks/use-booking-request-decisions', () => ({
  useBookingRequestDecisions: () => ({
    openApprove: vi.fn(),
    openReject: vi.fn(),
    decisionActionFor: () => null,
    dialogs: null,
  }),
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
  serviceType: 'self_drive',
  deliveryRequested: true,
  deliveryAddress: '123 Nguyễn Văn Linh',
  totalAmount: '2772000.00',
  canReview: false,
  hasReview: false,
  createdAt: '2026-08-01T00:00:00.000Z',
};

const COUNTS = { current: 3, history: 1 };

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
  it('có ĐÚNG hai tab, và tab hiện số của SERVER', () => {
    renderView();
    // Trang chỉ có 1 thẻ nhưng tab phải nói 3 — đếm ở client là sai ngay khi có nhiều hơn một
    // trang. Và chỉ hai tab: một tab cho mỗi chặng là màn cũ.
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByText('Chuyến hiện tại (3)')).toBeTruthy();
    expect(screen.getByText('Lịch sử chuyến (1)')).toBeTruthy();
  });

  it('thẻ chuyến hiện tổng tiền và cách nhận xe', () => {
    renderView();
    expect(screen.getByText('Toyota Camry 2024')).toBeTruthy();
    // Thẻ giờ ghép dịch vụ + cách nhận xe: "Tự lái · Giao xe tận nơi" (17/08).
    expect(screen.getByText(/Giao xe tận nơi/)).toBeTruthy();
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
    nav.params = new URLSearchParams('filter=history');
    renderView();
    // Tab đang chọn phải là `Lịch sử chuyến`, không phải mặc định `Chuyến hiện tại`.
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Lịch sử chuyến');
  });

  it('không có tham số thì mở tab Chuyến hiện tại', () => {
    renderView();
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Chuyến hiện tại');
  });

  it('tab Chuyến hiện tại trống thì mời đi tìm xe', () => {
    query.data = {
      items: [],
      meta: { page: 1, limit: 10, total: 0, hasNext: false },
      counts: COUNTS,
    };
    renderView();
    expect(screen.getByText('Bạn chưa có chuyến nào đang diễn ra')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tìm xe' })).toBeTruthy();
  });

  /*
   * Lịch sử trống là một câu chuyện khác: mời đi tìm xe ở đây là lạc đề khi khách có thể đang
   * có chuyến chạy dở ở tab bên cạnh.
   */
  it('tab Lịch sử trống thì đưa về tab chuyến hiện tại, không mời tìm xe', () => {
    nav.params = new URLSearchParams('filter=history');
    query.data = {
      items: [],
      meta: { page: 1, limit: 10, total: 0, hasNext: false },
      counts: COUNTS,
    };
    renderView();
    expect(screen.getByText('Chưa có chuyến nào kết thúc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem chuyến hiện tại' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tìm xe' })).toBeNull();
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
    expect(screen.queryByText('Bạn chưa có chuyến nào đang diễn ra')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
