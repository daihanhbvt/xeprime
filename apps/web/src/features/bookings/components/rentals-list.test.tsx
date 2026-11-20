import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  BOOKING_LIST_PRESET,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  PERMISSION,
  SERVICE_TYPE,
} from '@xeprime/types';
import { ROUTES, bookingPath } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';
import type { BookingRequestItem } from '@/features/booking-requests/types';
import type { BookingFilters, BookingListItem } from '../types';

// Hộp ghi nhận "Khách không đến" có test riêng (`booking-status-actions.test.tsx`) — ở đây chỉ cần biết thẻ mở đúng hộp cho đúng đơn.
vi.mock('./BookingStatusTransitionDialog', () => ({
  BookingStatusTransitionDialog: ({
    booking,
    target,
  }: {
    booking: { code: string };
    target: string;
  }) => <div role="dialog">{`${target} ${booking.code}`}</div>,
}));
// Hộp "Xác nhận đã nhận lại xe" có test riêng (`confirm-return-dialog.test.tsx`).
vi.mock('@/features/handovers/components/ConfirmReturnDialog', () => ({
  ConfirmReturnDialog: ({ booking }: { booking: { code: string } }) => (
    <div role="dialog">{`return ${booking.code}`}</div>
  ),
}));

/**
 * Màn "Đơn thuê xe" GỘP (05/11/2026) — bốn nhóm của một chuyến: Cần xử lý · Chờ khách thanh toán
 * (YÊU CẦU) · Chờ giao xe · Đang thuê (ĐƠN). Test chặn ở tầng hook đọc server và kiểm: truy vấn
 * nào được bật với tham số nào, số đếm cột trái, quyền theo thực thể, và hành vi của hai loại thẻ.
 * Thay cho `booking-requests-page.test.tsx` (hộp thư cũ) và `bookings-board.test.tsx` (bảng đơn cũ).
 */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/bookings',
  useSearchParams: () => nav.params,
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const me = vi.hoisted(() => ({ billingMode: 'package' as string }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { tenant: { billingMode: me.billingMode } } }),
}));

vi.mock(
  '@/features/branches/hooks/use-branch-filter',
  () => import('@/features/branches/test-utils'),
);
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({ state: 'enabled', canWrite: true, isVisible: true, planEndsAt: null }),
  useFeatureStates: () => ({}),
  usePlanEndsAt: () => null,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/features/calendar/api', () => ({ fetchCalendarQuote: vi.fn(async () => null) }));
vi.mock('@/features/booking-requests/components/StaffBookingDialog', () => ({
  StaffBookingDialog: () => null,
}));
vi.mock('./BookingDetailDialog', () => ({
  BookingDetailDialog: ({ bookingId, open }: { bookingId: string; open: boolean }) =>
    open ? <div data-testid="booking-detail-dialog">{bookingId}</div> : null,
}));
vi.mock('@/features/vehicles/components/VehicleDetailDialog', () => ({
  VehicleDetailDialog: ({ vehicleId, open }: { vehicleId: string; open: boolean }) =>
    open ? <div data-testid="vehicle-detail-dialog">{vehicleId}</div> : null,
}));
vi.mock('@/features/customers/components/CustomerDetailDialog', () => ({
  CustomerDetailDialog: ({ customerId, open }: { customerId: string; open: boolean }) =>
    open ? <div data-testid="customer-detail-dialog">{customerId}</div> : null,
}));

const mutations = vi.hoisted(() => ({
  approve: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
  reject: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
  cancel: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
  conversation: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
  remind: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
}));
vi.mock('@/features/booking-requests/hooks/use-booking-request-mutations', () => ({
  useApproveBookingRequest: () => mutations.approve,
  useRejectBookingRequest: () => mutations.reject,
  useCancelBookingRequest: () => mutations.cancel,
  useStartBookingRequestConversation: () => mutations.conversation,
  useRemindBookingRequestPayment: () => mutations.remind,
}));

/** Truy vấn YÊU CẦU: bắt tham số, trả dữ liệu theo trạng thái. */
const requests = vi.hoisted(() => ({
  calls: [] as Array<{ filters: Record<string, unknown>; enabled: boolean; live: boolean }>,
  byStatus: {} as Record<string, { items: unknown[]; total: number }>,
  error: false,
}));
const STATUS_COUNTS = [
  { status: 'pending_host_approval', count: 7 },
  { status: 'awaiting_hold', count: 4 },
  { status: 'converted_to_booking', count: 12 },
  { status: 'rejected_by_host', count: 3 },
  { status: 'cancelled_by_customer', count: 2 },
  { status: 'expired', count: 1 },
  { status: 'hold_expired', count: 2 },
  { status: 'slot_taken', count: 1 },
  { status: 'cancelled_by_host', count: 1 },
];
/** Dạng List không dùng truy vấn cột của Kanban — luôn tắt (`rentals-board.test.tsx` phủ Kanban). */
const IDLE_INFINITE = vi.hoisted(() => ({
  data: undefined,
  isError: false,
  isFetching: false,
  isPlaceholderData: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: () => undefined,
  refetch: () => undefined,
}));
vi.mock('../hooks/use-payment-arrival-toast', () => ({ usePaymentArrivalToast: () => undefined }));
vi.mock('@/features/booking-requests/hooks/use-booking-requests', () => ({
  LIVE_REFRESH_MS: 30_000,
  useBookingRequestsInfinite: () => IDLE_INFINITE,
  useBookingRequests: (
    filters: Record<string, unknown>,
    options: { enabled?: boolean; live?: boolean } = {},
  ) => {
    const enabled = options.enabled ?? true;
    requests.calls.push({ filters, enabled, live: options.live ?? false });
    if (!enabled) {
      return {
        data: undefined,
        isError: false,
        isFetching: false,
        isPlaceholderData: false,
        refetch: vi.fn(),
      };
    }
    if (requests.error) {
      return {
        data: undefined,
        isError: true,
        isFetching: false,
        isPlaceholderData: false,
        refetch: vi.fn(),
      };
    }
    const entry = requests.byStatus[String(filters.status)] ?? { items: [], total: 0 };
    return {
      data: {
        items: entry.items,
        meta: {
          page: 1,
          limit: 20,
          total: entry.total,
          hasNext: false,
          statusCounts: STATUS_COUNTS,
        },
      },
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    };
  },
}));

/** Truy vấn ĐƠN: bắt tham số, trả dữ liệu theo ngăn. */
const PRESET_COUNTS = [
  { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP, count: 5 },
  { preset: BOOKING_LIST_PRESET.RENTING, count: 2 },
  { preset: BOOKING_LIST_PRESET.COMPLETED, count: 20 },
  { preset: BOOKING_LIST_PRESET.CANCELLED, count: 1 },
];
const bookings = vi.hoisted(() => ({
  calls: [] as Array<{ filters: BookingFilters; enabled: boolean }>,
  byPreset: {} as Record<string, { items: unknown[]; total: number }>,
}));
vi.mock('../hooks/use-bookings', () => ({
  useBookingsInfinite: () => IDLE_INFINITE,
  useBookings: (f: BookingFilters, options: { enabled?: boolean } = {}) => {
    const enabled = options.enabled ?? true;
    bookings.calls.push({ filters: f, enabled });
    if (!enabled) {
      return {
        data: undefined,
        isError: false,
        isFetching: false,
        isPlaceholderData: false,
        refetch: vi.fn(),
      };
    }
    const entry = bookings.byPreset[f.preset ?? 'none'] ?? { items: [], total: 0 };
    return {
      data: {
        items: entry.items,
        meta: {
          page: 1,
          limit: 20,
          total: entry.total,
          hasNext: false,
          presetCounts: PRESET_COUNTS,
        },
      },
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    };
  },
}));

const { BookingsListView } = await import('./BookingsListView');
const { HOUR, booking, request } = await import('../test-utils');

function seedRequests(status: string, items: BookingRequestItem[], total = items.length) {
  requests.byStatus[status] = { items, total };
}
function seedBookings(preset: string, items: BookingListItem[], total = items.length) {
  bookings.byPreset[preset] = { items, total };
}
function renderPage(params = '') {
  nav.params = new URLSearchParams(params);
  return renderWithIntl(
    <App>
      <BookingsListView />
    </App>,
  );
}
const enabledRequestCalls = () => requests.calls.filter((c) => c.enabled).map((c) => c.filters);
const enabledBookingCalls = () => bookings.calls.filter((c) => c.enabled).map((c) => c.filters);
function cardFor(vehicleName: string): HTMLElement {
  const article = screen.getAllByText(vehicleName)[0]!.closest('article');
  if (!article) throw new Error(`Không tìm thấy thẻ của xe ${vehicleName}`);
  return article as HTMLElement;
}

beforeEach(() => {
  // Lần đầu mở màn mặc định là Kanban — file này kiểm dạng List nên nhớ sẵn lựa chọn List.
  window.localStorage.setItem('xp.rentals.view', 'list');
  permissions.granted = new Set([
    PERMISSION.BOOKING_REQUEST_VIEW,
    PERMISSION.BOOKING_REQUEST_APPROVE,
    PERMISSION.BOOKING_VIEW,
    PERMISSION.BOOKING_CREATE,
    PERMISSION.VEHICLE_VIEW,
    PERMISSION.CUSTOMER_VIEW,
  ]);
  me.billingMode = BILLING_MODE.PACKAGE;
  nav.push.mockClear();
  nav.replace.mockClear();
  requests.calls = [];
  requests.byStatus = {};
  requests.error = false;
  bookings.calls = [];
  bookings.byPreset = {};
  for (const key of Object.keys(mutations) as Array<keyof typeof mutations>) {
    mutations[key] = { mutate: vi.fn(), isPending: false, variables: undefined };
  }
});
afterEach(cleanup);

describe('Ô "Tất cả" - bốn truy vấn nhỏ, đúng thứ tự một chuyến', () => {
  it('hai nhóm YÊU CẦU xếp theo hạn đang chạy, hai nhóm ĐƠN theo ngăn; mỗi nhóm 3 chuyến, đều làm mới nền', () => {
    renderPage();
    expect(enabledRequestCalls().map((f) => f.status)).toEqual([
      BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    ]);
    expect(enabledRequestCalls().every((f) => f.sort === 'urgent' && f.limit === 3)).toBe(true);
    expect(enabledBookingCalls().map((f) => f.preset)).toEqual([
      BOOKING_LIST_PRESET.AWAITING_PICKUP,
      BOOKING_LIST_PRESET.RENTING,
    ]);
    expect(enabledBookingCalls().every((f) => f.limit === 3 && f.page === 1)).toBe(true);
    expect(requests.calls.filter((c) => c.enabled).every((c) => c.live)).toBe(true);
  });

  it('nhóm có nhiều hơn số đang hiện thì có "Xem tất cả (n)" sang nhóm đó', () => {
    seedRequests(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [request()], 7);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả (7)' }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/bookings?preset=needs_action', {
      scroll: false,
    });
  });

  it('không có chuyến nào ⇒ mời tạo đơn; tuyến hoa hồng không có lối lập đơn tay', () => {
    renderPage();
    expect(screen.getByText('Gian hàng chưa có đơn thuê nào')).toBeTruthy();
    cleanup();
    me.billingMode = BILLING_MODE.COMMISSION;
    renderPage();
    expect(screen.queryByRole('button', { name: /Tạo đơn thuê/ })).toBeNull();
  });

  it('chủ xe tuyến hoa hồng, chưa có chuyến ⇒ câu của chuyến từ chợ + lối "Xem xe của tôi"', () => {
    me.billingMode = BILLING_MODE.COMMISSION;
    renderPage();
    expect(screen.getByText('Chưa có chuyến thuê nào')).toBeTruthy();
    expect(screen.queryByText('Gian hàng chưa có đơn thuê nào')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Xem xe của tôi' }));
    expect(nav.push).toHaveBeenCalledWith(ROUTES.MANAGE.VEHICLES);
  });

  it('thiếu quyền xem xe ⇒ không mời sang một màn sẽ trả 403', () => {
    me.billingMode = BILLING_MODE.COMMISSION;
    permissions.granted.delete(PERMISSION.VEHICLE_VIEW);
    renderPage();
    expect(screen.getByText('Chưa có chuyến thuê nào')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem xe của tôi' })).toBeNull();
  });
});

describe('Cột trái + nút "Đơn đã kết thúc"', () => {
  it('số đếm từ server của CẢ HAI thực thể; "Tất cả" là tổng bốn nhóm', () => {
    renderPage();
    const rail = screen.getByRole('navigation', { name: 'Lọc đơn thuê theo trạng thái' });
    // 7 chờ duyệt + 4 chờ khách trả + 5 chờ giao + 2 đang thuê = 18.
    expect(within(rail).getByRole('button', { name: /Tất cả\s*18/ })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: /Cần xử lý\s*7/ })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: /Chờ khách thanh toán\s*4/ })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: /Chờ giao xe\s*5/ })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: /Đang thuê\s*2/ })).toBeTruthy();
  });

  it('"Đơn đã kết thúc" = đơn hoàn thành + huỷ (21) + yêu cầu không thành đơn (10)', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Đơn đã kết thúc \(31\)/ });
    expect(link.getAttribute('href')).toBe('/manage/bookings/ended');
  });

  it('chọn một nhóm ghi `preset` lên URL và gỡ `?status=` của link cũ', () => {
    renderPage('status=awaiting_hold');
    fireEvent.click(screen.getByRole('button', { name: /^Đang thuê/ }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/bookings?preset=renting', { scroll: false });
  });

  it('link cũ của hộp thư `?status=awaiting_hold` mở đúng nhóm "Chờ khách thanh toán"', () => {
    renderPage('status=awaiting_hold');
    expect(enabledRequestCalls().map((f) => f.status)).toContain(
      BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    );
    expect(enabledBookingCalls().filter((f) => f.limit !== 1)).toEqual([]);
  });

  it('thiếu `booking_requests.view` ⇒ hai nhóm yêu cầu vắng hẳn, không truy vấn yêu cầu nào', () => {
    permissions.granted.delete(PERMISSION.BOOKING_REQUEST_VIEW);
    renderPage();
    expect(screen.queryByRole('button', { name: /Cần xử lý/ })).toBeNull();
    expect(enabledRequestCalls()).toEqual([]);
    expect(screen.getByRole('button', { name: /Chờ giao xe/ })).toBeTruthy();
  });
});

describe('Một nhóm - danh sách đầy đủ', () => {
  it('nhóm yêu cầu: một truy vấn có trang; truy vấn đơn chỉ còn một-dòng để đọc số đếm', () => {
    renderPage('preset=needs_action&page=2');
    const [call] = enabledRequestCalls();
    expect(enabledRequestCalls()).toHaveLength(1);
    expect(call).toMatchObject({ status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, page: 2 });
    expect(enabledBookingCalls()).toEqual([expect.objectContaining({ limit: 1 })]);
  });

  it('nhóm đơn: mặc định sắp xếp của nhóm hiện trên ô "Sắp xếp", không ép sort lên API', () => {
    renderPage('preset=awaiting_pickup');
    const [call] = enabledBookingCalls();
    expect(call!.preset).toBe(BOOKING_LIST_PRESET.AWAITING_PICKUP);
    expect(call!.sort).toBeUndefined();
    expect(screen.getByText('Nhận xe sớm nhất')).toBeTruthy();
  });

  it('nhóm rỗng nói đúng câu của nhóm đó', () => {
    renderPage('preset=needs_action');
    expect(screen.getByText('Không còn yêu cầu nào cần xử lý')).toBeTruthy();
  });

  it('lỗi tải ⇒ màn lỗi có nút thử lại', () => {
    requests.error = true;
    renderPage('preset=needs_action');
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeTruthy();
  });
});

describe('Thẻ yêu cầu - Cần xử lý', () => {
  beforeEach(() => seedRequests(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [request()]));

  it('chưa có đơn ⇒ KHÔNG có mã #…, dải đầu là mốc "Gửi lúc"; có Từ chối + Xác nhận', () => {
    renderPage('preset=needs_action');
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).queryByText(/^#/)).toBeNull();
    expect(within(card).getByText(/Gửi lúc/)).toBeTruthy();
    expect(within(card).getByRole('button', { name: /^Từ chối$/ })).toBeTruthy();
    expect(within(card).getByRole('button', { name: /^Xác nhận$/ })).toBeTruthy();
  });

  it('thiếu `booking_requests.approve` ⇒ ẨN HẲN hai nút', () => {
    permissions.granted.delete(PERMISSION.BOOKING_REQUEST_APPROVE);
    renderPage('preset=needs_action');
    expect(screen.queryByRole('button', { name: /^Xác nhận$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Từ chối$/ })).toBeNull();
  });

  it('quá hạn phản hồi ⇒ không còn nút nào, có câu giải thích', () => {
    seedRequests(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [
      request({ respondBy: new Date(Date.now() - 60_000).toISOString() }),
    ]);
    renderPage('preset=needs_action');
    expect(screen.queryByRole('button', { name: /^Xác nhận$/ })).toBeNull();
  });

  it('bấm Xác nhận mở hộp "Phê duyệt yêu cầu thuê xe"; bấm "Xác nhận yêu cầu" mới gọi duyệt', async () => {
    renderPage('preset=needs_action');
    fireEvent.click(screen.getByRole('button', { name: /^Xác nhận$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Phê duyệt yêu cầu thuê xe')).toBeTruthy();
    expect(mutations.approve.mutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /Xác nhận yêu cầu/ }));
    expect(mutations.approve.mutate).toHaveBeenCalledWith(
      { id: 'req-1', body: {} },
      expect.anything(),
    );
  });

  it('thuê dài hạn đi hộp CHỐT LỊCH riêng', async () => {
    seedRequests(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [
      request({
        serviceType: SERVICE_TYPE.LONG_TERM,
        pickupAt: null,
        returnAt: null,
        longTermPackageMonths: 3,
        pickupPreference: 'within_7_days',
        pickupWindowStartDate: '2026-08-20',
        pickupWindowEndDate: '2026-08-27',
      }),
    ]);
    renderPage('preset=needs_action');
    fireEvent.click(screen.getByRole('button', { name: /^Xác nhận$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Phê duyệt yêu cầu thuê xe')).toBeNull();
  });

  it('từ chối: phải chọn lý do VÀ có ghi chú; chọn mẫu là điền sẵn câu, gửi đúng câu khách đọc', async () => {
    renderPage('preset=needs_action');
    fireEvent.click(screen.getByRole('button', { name: /^Từ chối$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối yêu cầu' }));
    expect(mutations.reject.mutate).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Chọn một lý do từ chối')).toBeTruthy();

    fireEvent.mouseDown(within(dialog).getByRole('combobox'));
    fireEvent.click(await screen.findByText('Lịch khách yêu cầu không sắp xếp được.'));
    const note = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    expect(note.value).toBe('Lịch khách yêu cầu không sắp xếp được.');
    fireEvent.change(note, { target: { value: 'Xe đang bảo dưỡng tới thứ Sáu.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối yêu cầu' }));
    expect(mutations.reject.mutate).toHaveBeenCalledWith(
      { id: 'req-1', reason: 'Xe đang bảo dưỡng tới thứ Sáu.' },
      expect.anything(),
    );
  });

  it('bấm vào thẻ mở chi tiết YÊU CẦU; đã thành đơn thì mở chi tiết ĐƠN', async () => {
    renderPage('preset=needs_action');
    fireEvent.click(within(cardFor('Kia Carnival 2025')).getByText('Khách tự nhận xe'));
    expect(await screen.findByText('Chi tiết yêu cầu thuê xe')).toBeTruthy();
    cleanup();

    seedRequests(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [
      request({ bookingId: 'bk-9', bookingCode: 'DH-9' }),
    ]);
    renderPage('preset=needs_action');
    fireEvent.click(screen.getByRole('button', { name: /Xem chi tiết yêu cầu/ }));
    expect(screen.getByTestId('booking-detail-dialog').textContent).toBe('bk-9');
  });

  it('tên xe mở hồ sơ XE dạng modal; "Xem lịch xe" là link thật lọc sẵn theo biển số', () => {
    renderPage('preset=needs_action');
    const card = cardFor('Kia Carnival 2025');
    fireEvent.click(within(card).getByRole('link', { name: 'Kia Carnival 2025' }));
    expect(screen.getByTestId('vehicle-detail-dialog').textContent).toBe('veh-1');
    // Nhãn truy cập nói rõ xe nào ("Xem lịch của …"); chữ hiện là "Xem lịch xe".
    const schedule = within(card).getByText('Xem lịch xe').closest('a');
    expect(schedule?.getAttribute('href')).toContain(encodeURIComponent('51A-123.45'));
  });

  it('chủ xe tuyến hoa hồng, yêu cầu chưa thành đơn ⇒ không có nút nhắn tin (ADR 0073)', () => {
    seedRequests(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [
      request({ chatOpen: false, customerPhone: null as unknown as string }),
    ]);
    renderPage('preset=needs_action');
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).queryByRole('button', { name: /Nhắn tin/ })).toBeNull();
    expect(within(card).queryByRole('link', { name: /Gọi/ })).toBeNull();
  });

  it('ô tiền: chưa duyệt thì tiền giữ chỗ là số DỰ KIẾN, kèm nhãn "Tạm tính"', () => {
    seedRequests(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [
      request({
        pricing: {
          rentalTotal: '1400000',
          customerTotalAmount: '1500000',
          isEstimate: true,
          holdAmount: null,
          holdPaidAmount: null,
          paidAmount: null,
          remainingAmount: null,
        } as unknown as BookingRequestItem['pricing'],
        approvalPreview: {
          collectsHold: true,
          onlineAmount: '500000',
          payAtPickupAmount: '1000000',
        } as unknown as BookingRequestItem['approvalPreview'],
      }),
    ]);
    renderPage('preset=needs_action');
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByText('Tiền giữ chỗ (dự kiến):')).toBeTruthy();
    expect(within(card).queryByText('Đã giữ chỗ:')).toBeNull();
    expect(within(card).getByText('Tạm tính')).toBeTruthy();
  });
});

describe('Thẻ yêu cầu - Chờ khách thanh toán', () => {
  const awaiting = (over: Partial<BookingRequestItem> = {}) =>
    request({
      status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
      decidedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      holdExpiresAt: new Date(Date.now() + 90 * 60_000).toISOString(),
      paymentReminderAvailableAt: new Date(Date.now() - 60_000).toISOString(),
      ...over,
    });

  it('có "Huỷ chuyến" + "Nhắc khách", đồng hồ "Chờ thanh toán"; KHÔNG có Xác nhận/Từ chối', () => {
    seedRequests(BOOKING_REQUEST_STATUS.AWAITING_HOLD, [awaiting()]);
    renderPage('preset=awaiting_payment');
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByRole('button', { name: 'Huỷ chuyến' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Nhắc khách' })).toBeTruthy();
    expect(within(card).getByText(/Chờ thanh toán:/)).toBeTruthy();
    expect(within(card).queryByRole('button', { name: /^Xác nhận$/ })).toBeNull();
  });

  it('bấm "Nhắc khách" gọi đúng yêu cầu', () => {
    seedRequests(BOOKING_REQUEST_STATUS.AWAITING_HOLD, [awaiting()]);
    renderPage('preset=awaiting_payment');
    fireEvent.click(screen.getByRole('button', { name: 'Nhắc khách' }));
    expect(mutations.remind.mutate).toHaveBeenCalledWith('req-1', expect.anything());
  });

  it('khách vừa được nhắc ⇒ nút mờ tới mốc server cho phép', () => {
    seedRequests(BOOKING_REQUEST_STATUS.AWAITING_HOLD, [
      awaiting({ paymentReminderAvailableAt: new Date(Date.now() + 10 * 60_000).toISOString() }),
    ]);
    renderPage('preset=awaiting_payment');
    expect((screen.getByRole('button', { name: 'Nhắc khách' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('server không mời nhắc (khoản đã chết / không có tài khoản) ⇒ không có nút', () => {
    seedRequests(BOOKING_REQUEST_STATUS.AWAITING_HOLD, [
      awaiting({ paymentReminderAvailableAt: null }),
    ]);
    renderPage('preset=awaiting_payment');
    expect(screen.queryByRole('button', { name: 'Nhắc khách' })).toBeNull();
  });

  it('huỷ: phải chọn lý do rồi mới gửi', async () => {
    seedRequests(BOOKING_REQUEST_STATUS.AWAITING_HOLD, [awaiting()]);
    renderPage('preset=awaiting_payment');
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ chuyến' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ yêu cầu thuê xe' }));
    expect(mutations.cancel.mutate).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Chọn một nhóm lý do')).toBeTruthy();
  });

  // Ghi chú cho khách chỉ bắt buộc với "Lý do khác" (chốt 06/11/2026, cùng luật với API).
  it('huỷ: ghi chú bắt buộc với "Lý do khác", tuỳ chọn với nhóm cụ thể', async () => {
    seedRequests(BOOKING_REQUEST_STATUS.AWAITING_HOLD, [awaiting()]);
    renderPage('preset=awaiting_payment');
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ chuyến' }));
    const dialog = await screen.findByRole('dialog');
    const pick = async (label: string) => {
      fireEvent.mouseDown(within(dialog).getByRole('combobox'));
      fireEvent.click(await screen.findByTitle(label));
    };

    await pick('Lý do khác');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ yêu cầu thuê xe' }));
    expect(mutations.cancel.mutate).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText('Nhập ghi chú để khách biết vì sao chuyến bị huỷ'),
    ).toBeTruthy();

    await pick('Trùng lịch với chuyến khác');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ yêu cầu thuê xe' }));
    expect(mutations.cancel.mutate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mutations.cancel.mutate.mock.calls[0])).not.toContain('"reason"');
    expect(JSON.stringify(mutations.cancel.mutate.mock.calls[0])).toContain('schedule_conflict');
  });
});

describe('Thẻ đơn - Chờ giao xe / Đang thuê', () => {
  it('Chờ giao: "Xử lý giao xe" mở TRANG chi tiết; thiếu quyền bàn giao thì chỉ "Chi tiết"', () => {
    permissions.granted.add(PERMISSION.HANDOVER_CONFIRM);
    seedBookings(BOOKING_LIST_PRESET.AWAITING_PICKUP, [booking({ id: 'A1' })]);
    renderPage('preset=awaiting_pickup');
    expect(screen.getByRole('link', { name: /Xử lý giao xe/ }).getAttribute('href')).toBe(
      bookingPath.detail('A1'),
    );
    cleanup();
    permissions.granted.delete(PERMISSION.HANDOVER_CONFIRM);
    renderPage('preset=awaiting_pickup');
    expect(screen.queryByRole('link', { name: /Xử lý giao xe/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Chi tiết' })).toBeTruthy();
  });

  it('quá giờ hẹn giao thì nói quá giờ', () => {
    seedBookings(BOOKING_LIST_PRESET.AWAITING_PICKUP, [
      booking({ id: 'A1', pickupAt: new Date(Date.now() - 2 * HOUR).toISOString() }),
    ]);
    renderPage('preset=awaiting_pickup');
    expect(screen.getByText(/Quá giờ giao xe/)).toBeTruthy();
  });

  it('qua ân hạn mà chưa giao ⇒ "Khách không đến" ngay trên thẻ, mở hộp ghi nhận; chưa qua ân hạn / thiếu quyền thì không', () => {
    permissions.granted.add(PERMISSION.BOOKING_UPDATE);
    seedBookings(BOOKING_LIST_PRESET.AWAITING_PICKUP, [
      booking({ id: 'A1', pickupAt: new Date(Date.now() - 2 * HOUR).toISOString() }),
      booking({ id: 'A2', pickupAt: new Date(Date.now() - 5 * 60_000).toISOString() }),
    ]);
    renderPage('preset=awaiting_pickup');
    const buttons = screen.getAllByRole('button', { name: 'Khách không đến' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(screen.getByRole('dialog').textContent).toBe(`${BOOKING_STATUS.NO_SHOW} XP-A1`);

    cleanup();
    permissions.granted.delete(PERMISSION.BOOKING_UPDATE);
    renderPage('preset=awaiting_pickup');
    expect(screen.queryByRole('button', { name: 'Khách không đến' })).toBeNull();
  });

  it('đã qua cả giờ TRẢ mà chưa xác nhận giao ⇒ câu đỏ riêng, không còn "Quá giờ giao xe"', () => {
    seedBookings(BOOKING_LIST_PRESET.AWAITING_PICKUP, [
      booking({
        id: 'A1',
        pickupAt: new Date(Date.now() - 30 * HOUR).toISOString(),
        returnAt: new Date(Date.now() - 6 * HOUR).toISOString(),
      }),
    ]);
    renderPage('preset=awaiting_pickup');
    expect(screen.getByText(/Quá cả giờ trả xe .* chưa xác nhận giao xe/)).toBeTruthy();
    expect(screen.queryByText(/Quá giờ giao xe/)).toBeNull();
  });

  it('Đang thuê + khách đã báo trả xe ⇒ thẻ nói lời báo và hạn tự hoàn thành thay cho "quá giờ trả"', () => {
    seedBookings(BOOKING_LIST_PRESET.RENTING, [
      booking({
        id: 'R1',
        status: BOOKING_STATUS.ACTIVE,
        pickupAt: new Date(Date.now() - 30 * HOUR).toISOString(),
        returnAt: new Date(Date.now() - 2 * HOUR).toISOString(),
        customerReturnedAt: new Date(Date.now() - HOUR).toISOString(),
        returnAutoCompleteAt: new Date(Date.now() + 23 * HOUR).toISOString(),
      }),
    ]);
    renderPage('preset=renting');
    expect(screen.getByText(/Khách báo đã trả xe .* tự hoàn thành/)).toBeTruthy();
    expect(screen.queryByText(/Quá giờ trả xe/)).toBeNull();
  });

  it('Đang thuê: thanh tiến độ + "Còn lại"; "Nhận xe" mở hộp nhận xe; "Gia hạn" chỉ đơn dài hạn qua chợ', () => {
    permissions.granted.add(PERMISSION.HANDOVER_CONFIRM);
    permissions.granted.add(PERMISSION.BOOKING_UPDATE);
    seedBookings(BOOKING_LIST_PRESET.RENTING, [
      booking({
        id: 'L1',
        status: BOOKING_STATUS.ACTIVE,
        serviceType: SERVICE_TYPE.LONG_TERM,
        bookingRequestId: 'REQ1',
        pickupAt: new Date(Date.now() - 6 * HOUR).toISOString(),
        actualPickupAt: new Date(Date.now() - 6 * HOUR).toISOString(),
        returnAt: new Date(Date.now() + 4 * HOUR + 60_000).toISOString(),
      }),
      booking({ id: 'S1', status: BOOKING_STATUS.ACTIVE, bookingRequestId: 'REQ2' }),
    ]);
    renderPage('preset=renting');
    expect(screen.getByText('Còn lại: 4 giờ')).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Gia hạn/ })).toHaveLength(1);
    // "Nhận xe" mở THẲNG hộp xác nhận (06/11/2026), cho đúng đơn — không đổi trang.
    expect(screen.queryByRole('link', { name: /Nhận xe/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Nhận xe/ })[0]!);
    expect(screen.getByRole('dialog').textContent).toBe('return XP-L1');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('ô tiền đơn qua chợ: tiền thuê · khách trả · đã giữ chỗ · trả chủ xe khi nhận xe', () => {
    seedBookings(BOOKING_LIST_PRESET.AWAITING_PICKUP, [
      booking({
        id: 'M1',
        totalAmount: '1400000',
        customerTotalAmount: '1500000',
        holdPaidAmount: '500000',
        payAtPickupAmount: '1000000',
      }),
    ]);
    renderPage('preset=awaiting_pickup');
    const card = cardFor('Hyundai Grand i10');
    for (const label of ['Tiền thuê:', 'Khách trả:', 'Đã giữ chỗ:', 'Trả chủ xe khi nhận xe:']) {
      expect(within(card).getByText(label)).toBeTruthy();
    }
    expect(within(card).queryByText('Còn phải thu:')).toBeNull();
  });

  it('đơn tự lập ngoài chợ (không có khoản giữ chỗ): tiền thuê · đã thu · còn phải thu', () => {
    seedBookings(BOOKING_LIST_PRESET.AWAITING_PICKUP, [booking({ id: 'W1' })]);
    renderPage('preset=awaiting_pickup');
    const card = cardFor('Hyundai Grand i10');
    expect(within(card).getByText('Đã thu:')).toBeTruthy();
    expect(within(card).getByText('Còn phải thu:')).toBeTruthy();
  });

  it('bấm vào thẻ (chỗ trống) mở trang chi tiết đơn', () => {
    seedBookings(BOOKING_LIST_PRESET.AWAITING_PICKUP, [booking({ id: 'A1' })]);
    renderPage('preset=awaiting_pickup');
    fireEvent.click(within(cardFor('Hyundai Grand i10')).getByText('Tiền thuê:'));
    expect(nav.push).toHaveBeenCalledWith(bookingPath.detail('A1'));
  });
});
