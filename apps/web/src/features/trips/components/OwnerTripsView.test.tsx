import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, TRIP_ROLE } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';

import { OwnerTripsView } from './OwnerTripsView';

/**
 * `Chuyến cho thuê` của chủ xe tuyến hoa hồng (site partner).
 *
 * Điều được khoá: danh sách đọc ĐÚNG vai `host`; quyết định trên thẻ đi qua CÙNG luồng với hộp
 * thư gian hàng; "Xem chi tiết" mở hộp thoại ĐƠN khi đã có đơn và hộp thoại YÊU CẦU khi chưa có —
 * không bao giờ là trang `/trips/[id]` của site khách (site partner không có trang đó).
 */
const query = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  isFetching: false,
  error: undefined as unknown,
  refetch: vi.fn(),
  lastArgs: [] as unknown[],
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn(), push: vi.fn() }));
const decisions = vi.hoisted(() => ({
  openApprove: vi.fn(),
  openReject: vi.fn(),
  openCancel: vi.fn(),
}));
const api = vi.hoisted(() => ({ fetchBookingRequest: vi.fn() }));
const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('../hooks', () => ({
  useTrips: (...args: unknown[]) => {
    query.lastArgs = args;
    return query;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => nav.params,
  usePathname: () => '/manage/trips',
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

vi.mock('@/features/booking-requests/hooks/use-booking-request-decisions', () => ({
  useBookingRequestDecisions: () => ({
    ...decisions,
    decisionActionFor: () => null,
    dialogs: null,
  }),
}));

vi.mock('@/features/booking-requests/api', () => ({
  fetchBookingRequest: api.fetchBookingRequest,
}));

/* Hai hộp thoại chi tiết là màn DÙNG CHUNG của Manage (có test riêng) — ở đây chỉ cần biết mở cái nào. */
vi.mock('@/features/bookings/components/BookingDetailDialog', () => ({
  BookingDetailDialog: ({ bookingId, open }: { bookingId: string; open: boolean }) =>
    open ? <div data-testid="booking-detail-dialog">{bookingId}</div> : null,
}));
vi.mock('@/features/booking-requests/components/BookingRequestDetailDialog', () => ({
  BookingRequestDetailDialog: ({ request }: { request: { id: string } | null }) =>
    request ? <div data-testid="request-detail-dialog">{request.id}</div> : null,
}));
vi.mock('@/features/vehicles/components/VehicleDetailDialog', () => ({
  VehicleDetailDialog: () => null,
}));

const BASE_TRIP = {
  id: 'RQ1',
  bookingId: null,
  code: null,
  stage: 'pending_approval',
  role: TRIP_ROLE.HOST,
  renter: { name: 'Trần Thị Bình', phone: null },
  respondBy: new Date(Date.now() + 60 * 60_000).toISOString(),
  canContact: false,
  vehicle: {
    id: 'V1',
    name: 'Mazda CX-5 2023',
    imageUrl: null,
    seatCount: 5,
    transmission: null,
    fuelType: null,
    plateNumber: '51H-678.90',
  },
  shop: { name: 'Chủ xe Hương', slug: 'huong', ratingAvg: 0, ratingCount: 0, phone: null },
  pickupAt: '2026-10-10T02:00:00.000Z',
  returnAt: '2026-10-12T02:00:00.000Z',
  serviceType: 'self_drive',
  deliveryRequested: false,
  totalAmount: '1800000.00',
  totalIsEstimate: true,
  longTermPackageMonths: null,
  pickupPreference: null,
  requestedPickupDate: null,
  pickupWindowStartDate: null,
  pickupWindowEndDate: null,
  canReview: false,
  hasReview: false,
  createdAt: '2026-10-07T00:00:00.000Z',
};

const BOOKED_TRIP = {
  ...BASE_TRIP,
  id: 'RQ2',
  bookingId: 'BK2',
  code: 'XP-0099',
  stage: 'ready',
  respondBy: null,
  canContact: true,
  renter: { name: 'Lê Văn Cường', phone: '0909000111' },
  vehicle: { ...BASE_TRIP.vehicle, id: 'V2', name: 'Toyota Vios 2022' },
  totalIsEstimate: false,
};

function setTrips(items: unknown[]) {
  query.data = {
    items,
    meta: { page: 1, limit: 10, total: items.length, hasNext: false },
    counts: { current: items.length, history: 0 },
  };
}

beforeEach(() => {
  setTrips([BASE_TRIP, BOOKED_TRIP]);
  query.isLoading = false;
  query.isError = false;
  query.isFetching = false;
  query.error = undefined;
  query.lastArgs = [];
  nav.params = new URLSearchParams();
  nav.replace.mockClear();
  nav.push.mockClear();
  decisions.openApprove.mockClear();
  decisions.openReject.mockClear();
  api.fetchBookingRequest.mockReset();
  permissions.granted = new Set([
    PERMISSION.BOOKING_REQUEST_VIEW,
    PERMISSION.BOOKING_REQUEST_APPROVE,
    PERMISSION.BOOKING_VIEW,
    PERMISSION.VEHICLE_VIEW,
    PERMISSION.CUSTOMER_VIEW,
  ]);
});

afterEach(cleanup);

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <OwnerTripsView />
      </App>
    </QueryClientProvider>,
  );
}

function detailButtonOf(vehicleName: string): HTMLElement {
  const button = Array.from(cardOf(vehicleName).querySelectorAll('button')).find(
    (node) => node.textContent === 'Xem chi tiết',
  );
  if (!button) throw new Error(`Không thấy nút chi tiết của ${vehicleName}`);
  return button;
}

function cardOf(vehicleName: string): HTMLElement {
  const card = screen.getByText(vehicleName).closest('article');
  if (!card) throw new Error(`Không thấy thẻ của ${vehicleName}`);
  return card as HTMLElement;
}

describe('Chuyến cho thuê — danh sách', () => {
  it('đọc chuyến ở vai CHỦ XE, không phải chuyến đi thuê', () => {
    renderView();
    expect(query.lastArgs[2]).toBe(TRIP_ROLE.HOST);
    expect(screen.getByRole('heading', { level: 1, name: 'Chuyến cho thuê' })).toBeTruthy();
  });

  it('thẻ nói khách thuê là ai, và tên xe KHÔNG là link tới trang chuyến của site khách', () => {
    renderView();
    expect(screen.getByText('Trần Thị Bình')).toBeTruthy();
    const card = cardOf('Mazda CX-5 2023');
    expect(card.querySelector('a[href*="/trips/"]')).toBeNull();
  });

  it('tab trống ở chuyến hiện tại dẫn về xe của tôi, không mời đi tìm xe', () => {
    setTrips([]);
    renderView();
    expect(screen.getByText('Chưa có chuyến nào đang diễn ra')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xem xe của tôi' }));
    expect(nav.push).toHaveBeenCalledWith(ROUTES.MANAGE.VEHICLES);
    expect(screen.queryByRole('button', { name: 'Tìm xe' })).toBeNull();
  });

  it('quá hạn phản hồi và bị từ chối là HAI nhãn khác nhau', () => {
    setTrips([
      { ...BASE_TRIP, stage: 'rejected', respondBy: null },
      {
        ...BASE_TRIP,
        id: 'RQ3',
        stage: 'expired',
        respondBy: null,
        vehicle: { ...BASE_TRIP.vehicle, id: 'V3', name: 'Kia Morning 2021' },
      },
    ]);
    nav.params = new URLSearchParams('filter=history');
    renderView();
    expect(within(cardOf('Mazda CX-5 2023')).getByText('Bị từ chối')).toBeTruthy();
    expect(within(cardOf('Kia Morning 2021')).getByText('Quá hạn phản hồi')).toBeTruthy();
  });

  it('chuyến đã khép chưa từng có đơn KHÔNG hứa "chốt khi duyệt"', () => {
    setTrips([{ ...BASE_TRIP, stage: 'rejected', respondBy: null }]);
    nav.params = new URLSearchParams('filter=history');
    renderView();
    expect(screen.getByText('Báo giá lúc gửi yêu cầu')).toBeTruthy();
    expect(screen.queryByText('Tạm tính · chốt khi duyệt')).toBeNull();
  });

  it('ô lọc chặng chỉ có chặng của tab đang mở, không còn chặng đã gỡ', () => {
    nav.params = new URLSearchParams('filter=history');
    renderView();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Lọc theo trạng thái chuyến' }));
    // Danh sách `role=option` của AntD mang GIÁ TRỊ (mã chặng) — đúng thứ cần khoá ở đây.
    const values = screen.getAllByRole('option').map((node) => node.textContent);
    expect(values).toContain('completed');
    expect(values).not.toContain('pending_approval');
    expect(values).not.toContain('pending_approval_paid');
  });

  it('đổi tab ghi lên URL của site partner', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: /Lịch sử chuyến/ }));
    expect(nav.replace).toHaveBeenCalledWith(`${ROUTES.MANAGE.TRIPS}?filter=history`, {
      scroll: false,
    });
  });
});

describe('Chuyến cho thuê — quyết định và chi tiết', () => {
  it('yêu cầu còn chờ: "Xác nhận" mở luồng duyệt dùng chung với hộp thư', () => {
    renderView();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Xác nhận' }).find((button) =>
        cardOf('Mazda CX-5 2023').contains(button),
      )!,
    );
    expect(decisions.openApprove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'RQ1', vehicleName: 'Mazda CX-5 2023' }),
    );
  });

  it('thiếu quyền duyệt ⇒ không có nút quyết định nào', () => {
    permissions.granted.delete(PERMISSION.BOOKING_REQUEST_APPROVE);
    renderView();
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).toBeNull();
  });

  it('đã có đơn ⇒ "Xem chi tiết" mở hộp thoại ĐƠN', () => {
    renderView();
    fireEvent.click(detailButtonOf('Toyota Vios 2022'));
    expect(screen.getByTestId('booking-detail-dialog').textContent).toBe('BK2');
    expect(api.fetchBookingRequest).not.toHaveBeenCalled();
  });

  it('chưa có đơn ⇒ đọc yêu cầu rồi mở hộp thoại YÊU CẦU', async () => {
    api.fetchBookingRequest.mockResolvedValue({ id: 'RQ1', vehicleId: 'V1' });
    renderView();
    fireEvent.click(detailButtonOf('Mazda CX-5 2023'));
    await waitFor(() => expect(screen.getByTestId('request-detail-dialog').textContent).toBe('RQ1'));
    expect(api.fetchBookingRequest).toHaveBeenCalledWith('RQ1');
    expect(screen.queryByTestId('booking-detail-dialog')).toBeNull();
  });

  it('đọc yêu cầu lỗi ⇒ báo lỗi kèm thử lại, không mở hộp thoại rỗng', async () => {
    api.fetchBookingRequest.mockRejectedValue(new Error('boom'));
    renderView();
    fireEvent.click(detailButtonOf('Mazda CX-5 2023'));
    expect(await screen.findAllByText('Không mở được yêu cầu này')).not.toHaveLength(0);
    expect(screen.queryByTestId('request-detail-dialog')).toBeNull();
  });

  /*
   * Bấm thẻ A (chưa có đơn, đang nạp) rồi thẻ B (có đơn): MỘT trạng thái chọn cho cả hai hộp
   * thoại, nên A về sau cũng không được mở chồng lên B.
   */
  it('mở thẻ khác khi yêu cầu trước còn đang nạp ⇒ chỉ hộp thoại của thẻ sau', async () => {
    let resolveA: (value: unknown) => void = () => undefined;
    api.fetchBookingRequest.mockReturnValue(new Promise((resolve) => (resolveA = resolve)));
    renderView();
    fireEvent.click(detailButtonOf('Mazda CX-5 2023'));
    fireEvent.click(detailButtonOf('Toyota Vios 2022'));
    resolveA({ id: 'RQ1', vehicleId: 'V1' });
    await waitFor(() => expect(screen.getByTestId('booking-detail-dialog').textContent).toBe('BK2'));
    expect(screen.queryByTestId('request-detail-dialog')).toBeNull();
  });
});
