import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRIP_ROLE } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
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
  /** Đối số của lần gọi `useTrips` gần nhất: `[filter, page, role]`. */
  lastArgs: [] as unknown[],
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn(), push: vi.fn() }));

/** Lời nhắc thanh toán đầu trang — có test riêng (`UnpaidHoldsReminder.test.tsx`); ở đây im lặng. */
vi.mock('../hooks', () => ({
  useTrips: (...args: unknown[]) => {
    query.lastArgs = args;
    return query;
  },
  useUnpaidHolds: () => ({ data: undefined }),
}));

/** Khu tài xế (ADR 0063) — tài khoản này chưa từng được mời làm tài xế nên không có tab/mục tài xế. */
vi.mock('@/features/driving/hooks', () => ({
  useDriverPendingCounts: () => ({ data: { invites: 0, trips: 0, hasLinks: false } }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => nav.params,
}));

vi.mock('@/features/auth/components/AuthModalProvider', () => ({
  useAuthModal: () => ({ open: vi.fn() }),
  useNextFromCurrentPath: () => () => '/trips',
}));

/** Nút nhắn tin trên thẻ mở hội thoại qua React Query — có test riêng; ở đây chỉ cần nó có mặt. */
vi.mock('@/features/chat/components/ChatWithShopButton', () => ({
  ChatWithShopButton: ({ label }: { label?: string }) => (
    <button type="button" aria-label={label}>
      chat
    </button>
  ),
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
  query.lastArgs = [];
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
    expect(screen.getByRole('tab', { name: 'Chuyến hiện tại (3)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Lịch sử chuyến (1)' })).toBeTruthy();
  });

  it('tiêu đề trang là h1 của thẻ "Chuyến của tôi"', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1, name: 'Chuyến của tôi' })).toBeTruthy();
  });

  it('thẻ chuyến hiện tổng tiền và cách nhận xe', () => {
    renderView();
    expect(screen.getByText('Toyota Camry 2024')).toBeTruthy();
    // Thẻ giờ ghép dịch vụ + cách nhận xe: "Tự lái · Giao xe tận nơi" (17/08).
    expect(screen.getByText(/Giao xe tận nơi/)).toBeTruthy();
    // Ba cột tiền của thẻ rút gọn theo nghìn ("2.772 K") — số đầy đủ ở trang chi tiết.
    expect(screen.getAllByText(/2\.772 K/).length).toBeGreaterThan(0);
    // Mã chuyến, biển số, chủ xe và lối nhắn tin — Figma "Vehicle Card".
    expect(screen.getByText('#XP-0042')).toBeTruthy();
    expect(screen.getByText('43A-123.45')).toBeTruthy();
    expect(screen.getByText('Gian hàng Minh Tuấn')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nhắn tin cho chủ xe' })).toBeTruthy();
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
  it('lối vào chi tiết là MỘT liên kết (tên xe), không phải nút lồng trong liên kết', () => {
    renderView();
    const link = screen.getByRole('link', { name: 'Toyota Camry 2024' });
    expect(link.getAttribute('href')).toBe('/trips/RQ1');
    expect(link.querySelector('button')).toBeNull();
    // Nút nhắn tin là đích RIÊNG, đứng ngoài liên kết.
    expect(screen.getByRole('button', { name: 'Nhắn tin cho chủ xe' }).closest('a')).toBeNull();
  });

  it('đang tải lần đầu thì báo bận, không hiện "chưa có chuyến nào"', () => {
    query.isLoading = true;
    query.data = undefined;
    renderView();
    expect(screen.queryByText('Bạn chưa có chuyến nào đang diễn ra')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});

/**
 * CHỈ chuyến ĐI THUÊ (ADR 0053). Site khách không có phía "cho thuê": tài khoản khách không có gian
 * hàng. Vai gửi lên server luôn là `renter`, kể cả khi URL cũ mang `?role=host`.
 */
describe('TripsView — chỉ chuyến đi thuê', () => {
  it('không dựng hàng chọn vai nào', () => {
    renderView();

    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByText('Tôi cho thuê')).toBeNull();
    expect(screen.queryByText('Tôi đi thuê')).toBeNull();
  });

  it('luôn hỏi server ĐÚNG vai renter', () => {
    renderView();

    expect(query.lastArgs[2]).toBe(TRIP_ROLE.RENTER);
  });

  it('?role=host cũ trên URL KHÔNG mở được chuyến cho thuê', () => {
    nav.params = new URLSearchParams('role=host');
    renderView();

    expect(query.lastArgs[2]).toBe(TRIP_ROLE.RENTER);
  });

  it('đổi tab bỏ ?role= cũ và ghi URL ở /trips', () => {
    nav.params = new URLSearchParams('role=host&ref=mail');
    renderView();

    fireEvent.click(screen.getByRole('tab', { name: /Lịch sử chuyến/ }));

    const [href] = nav.replace.mock.calls.at(-1) as [string];
    expect(href.startsWith(`${ROUTES.TRIPS}?`)).toBe(true);
    expect(href).not.toContain('role=');
    expect(href).toContain('ref=mail');
  });

  it('liên kết chi tiết trỏ vào /trips của site khách', () => {
    renderView();

    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    expect(links.some((href) => href.startsWith(`${ROUTES.TRIPS}/`))).toBe(true);
    expect(links.some((href) => href.startsWith(ROUTES.MANAGE.ROOT))).toBe(false);
  });
});
