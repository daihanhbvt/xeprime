import { App } from 'antd';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  BOOKING_LIST_PRESET,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  PERMISSION,
} from '@xeprime/types';
import { bookingPath } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';

/**
 * Dạng KANBAN của màn "Đơn thuê xe" (05/11/2026, Figma `23895:15181`): dạng xem nào được hiện, bốn
 * cột cuộn vô hạn với đúng tham số, tay nắm kéo chỉ ở thẻ có bước kế, và lượt THẢ chỉ mở đúng chỗ nút
 * trên thẻ mở (hộp Phê duyệt / trang chi tiết) — không đổi trạng thái nào. Dạng List:
 * `rentals-list.test.tsx`.
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

const media = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => media.mobile,
  usePrefersReducedMotion: () => true,
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
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { tenant: { billingMode: BILLING_MODE.PACKAGE } } }),
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
/*
 * Bóng thẻ (DragOverlay) đo vị trí của CHÍNH nó để tính va chạm; jsdom không có bố cục nên nó luôn
 * 0×0 và lượt thả không trúng cột nào. Bỏ bóng đi thì dnd-kit đo thẻ gốc — thứ test cấp hình được.
 */
vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dnd-kit/core')>()),
  DragOverlay: () => null,
}));
vi.mock('../hooks/use-payment-arrival-toast', () => ({ usePaymentArrivalToast: () => undefined }));

const mutations = vi.hoisted(() => ({
  idle: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
}));
vi.mock('@/features/booking-requests/hooks/use-booking-request-mutations', () => ({
  useApproveBookingRequest: () => mutations.idle,
  useRejectBookingRequest: () => mutations.idle,
  useCancelBookingRequest: () => mutations.idle,
  useStartBookingRequestConversation: () => mutations.idle,
  useRemindBookingRequestPayment: () => mutations.idle,
}));

/** Một cột: các trang đã tải + có trang kế không. */
interface ColumnSeed {
  pages: unknown[][];
  hasNext?: boolean;
}
const STATUS_COUNTS = [
  { status: 'pending_host_approval', count: 7 },
  { status: 'awaiting_hold', count: 4 },
];
const PRESET_COUNTS = [
  { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP, count: 5 },
  { preset: BOOKING_LIST_PRESET.RENTING, count: 2 },
];
const columns = vi.hoisted(() => ({
  requestCalls: [] as Array<{ filters: Record<string, unknown>; enabled: boolean; live: boolean }>,
  bookingCalls: [] as Array<{ filters: Record<string, unknown>; enabled: boolean; live: boolean }>,
  listCalls: [] as Array<{ enabled: boolean }>,
  byKey: {} as Record<string, ColumnSeed>,
  fetchNextPage: vi.fn(),
}));
function infiniteResult(
  key: string,
  enabled: boolean,
  counts: Record<string, unknown>,
): Record<string, unknown> {
  const seed = columns.byKey[key] ?? { pages: [[]] };
  return {
    data: enabled
      ? {
          pages: seed.pages.map((items, index) => ({
            items,
            meta: { page: index + 1, limit: 10, total: 0, hasNext: false, ...counts },
          })),
        }
      : undefined,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    hasNextPage: enabled && Boolean(seed.hasNext),
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: () => columns.fetchNextPage(key),
    refetch: vi.fn(),
  };
}
const IDLE_LIST = vi.hoisted(() => ({
  data: undefined,
  isError: false,
  isFetching: false,
  isPlaceholderData: false,
  refetch: () => undefined,
}));
vi.mock('@/features/booking-requests/hooks/use-booking-requests', () => ({
  LIVE_REFRESH_MS: 30_000,
  useBookingRequests: (_f: unknown, options: { enabled?: boolean } = {}) => {
    columns.listCalls.push({ enabled: options.enabled ?? true });
    return IDLE_LIST;
  },
  useBookingRequestsInfinite: (
    filters: Record<string, unknown>,
    options: { enabled?: boolean; live?: boolean } = {},
  ) => {
    const enabled = options.enabled ?? true;
    columns.requestCalls.push({ filters, enabled, live: options.live ?? false });
    return infiniteResult(String(filters.status), enabled, { statusCounts: STATUS_COUNTS });
  },
}));
vi.mock('../hooks/use-bookings', () => ({
  useBookings: (_f: unknown, options: { enabled?: boolean } = {}) => {
    columns.listCalls.push({ enabled: options.enabled ?? true });
    return IDLE_LIST;
  },
  useBookingsInfinite: (
    filters: Record<string, unknown>,
    options: { enabled?: boolean; live?: boolean } = {},
  ) => {
    const enabled = options.enabled ?? true;
    columns.bookingCalls.push({ filters, enabled, live: options.live ?? false });
    return infiniteResult(String(filters.preset), enabled, { presetCounts: PRESET_COUNTS });
  },
}));

const { BookingsListView } = await import('./BookingsListView');
const { HOUR, booking, request } = await import('../test-utils');

function seed(key: string, ...pages: unknown[][]) {
  columns.byKey[key] = { pages };
}
function renderPage(params = '') {
  nav.params = new URLSearchParams(params);
  return renderWithIntl(
    <App>
      <BookingsListView />
    </App>,
  );
}
function column(name: string): HTMLElement {
  return screen
    .getByRole('heading', { level: 2, name: new RegExp(`^${name}`) })
    .closest('section')!;
}

beforeEach(() => {
  window.localStorage.clear();
  media.mobile = false;
  permissions.granted = new Set([
    PERMISSION.BOOKING_REQUEST_VIEW,
    PERMISSION.BOOKING_REQUEST_APPROVE,
    PERMISSION.BOOKING_VIEW,
    PERMISSION.HANDOVER_CONFIRM,
    PERMISSION.VEHICLE_VIEW,
  ]);
  nav.push.mockClear();
  nav.replace.mockClear();
  columns.requestCalls = [];
  columns.bookingCalls = [];
  columns.listCalls = [];
  columns.byKey = {};
  columns.fetchNextPage = vi.fn();
});
afterEach(cleanup);

describe('Dạng xem nào được hiện', () => {
  it('lần đầu mở (chưa chọn bao giờ, link không ghi) ⇒ Kanban bốn cột, không có cột trạng thái bên trái', () => {
    renderPage();
    expect(screen.getByRole('region', { name: 'Bảng đơn thuê theo chặng' })).toBeTruthy();
    for (const name of ['Cần xử lý', 'Chờ khách thanh toán', 'Chờ giao xe', 'Đang thuê']) {
      expect(column(name)).toBeTruthy();
    }
    expect(screen.queryByRole('navigation', { name: 'Lọc đơn thuê theo trạng thái' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Xem dạng bảng Kanban' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('Chỉ kéo được sang bước tiếp theo')).toBeTruthy();
  });

  it('`?view=list` thắng lựa chọn đã nhớ; lựa chọn đã nhớ thắng mặc định', () => {
    window.localStorage.setItem('xp.rentals.view', 'board');
    renderPage('view=list');
    expect(screen.queryByRole('region', { name: 'Bảng đơn thuê theo chặng' })).toBeNull();
    cleanup();
    window.localStorage.setItem('xp.rentals.view', 'list');
    renderPage();
    expect(screen.queryByRole('region', { name: 'Bảng đơn thuê theo chặng' })).toBeNull();
  });

  it('bấm nút List ghi `?view=list` lên URL VÀ nhớ cho lần sau', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Xem dạng danh sách' }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/bookings?view=list', { scroll: false });
    expect(window.localStorage.getItem('xp.rentals.view')).toBe('list');
  });

  it('điện thoại LUÔN là List, không có nút chuyển — kể cả link `?view=board`', () => {
    media.mobile = true;
    renderPage('view=board');
    expect(screen.queryByRole('region', { name: 'Bảng đơn thuê theo chặng' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xem dạng bảng Kanban' })).toBeNull();
  });
});

describe('Bốn cột — truy vấn cuộn vô hạn, đúng phạm vi', () => {
  it('hai cột YÊU CẦU xếp theo hạn đang chạy, hai cột ĐƠN theo ngăn; trang 10 thẻ; truy vấn dạng List tắt hết', () => {
    renderPage('q=Kia&branchId=b-1');
    const requestCalls = columns.requestCalls.filter((c) => c.enabled);
    expect(requestCalls.map((c) => c.filters.status)).toEqual([
      BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    ]);
    expect(requestCalls.every((c) => c.filters.sort === 'urgent' && c.filters.limit === 10)).toBe(
      true,
    );
    const bookingCalls = columns.bookingCalls.filter((c) => c.enabled);
    expect(bookingCalls.map((c) => c.filters.preset)).toEqual([
      BOOKING_LIST_PRESET.AWAITING_PICKUP,
      BOOKING_LIST_PRESET.RENTING,
    ]);
    // Không ép sort — server tự xếp theo giờ hẹn giao / giờ phải về.
    expect(bookingCalls.every((c) => c.filters.sort === undefined && c.filters.limit === 10)).toBe(
      true,
    );
    expect(
      [...requestCalls, ...bookingCalls].every(
        (c) => c.filters.q === 'Kia' && c.filters.branchId === 'b-1' && c.live,
      ),
    ).toBe(true);
    expect(columns.listCalls.every((c) => !c.enabled)).toBe(true);
  });

  it('số đếm đầu cột từ server; nút "Đơn đã kết thúc" vẫn có số', () => {
    renderPage();
    expect(within(column('Cần xử lý')).getByText('7')).toBeTruthy();
    expect(within(column('Chờ khách thanh toán')).getByText('4')).toBeTruthy();
    expect(within(column('Chờ giao xe')).getByText('5')).toBeTruthy();
    expect(within(column('Đang thuê')).getByText('2')).toBeTruthy();
  });

  it('thiếu `bookings.view` ⇒ hai cột đơn vắng hẳn', () => {
    permissions.granted.delete(PERMISSION.BOOKING_VIEW);
    renderPage();
    expect(screen.queryByRole('heading', { level: 2, name: /^Chờ giao xe/ })).toBeNull();
    expect(columns.bookingCalls.every((c) => !c.enabled)).toBe(true);
  });

  it('gộp các trang, BỎ TRÙNG thẻ dời qua ranh trang; còn trang kế thì có "Tải thêm"', () => {
    seed(
      BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      [request({ id: 'r1', vehicleName: 'Xe Một' }), request({ id: 'r2', vehicleName: 'Xe Hai' })],
      [request({ id: 'r2', vehicleName: 'Xe Hai' }), request({ id: 'r3', vehicleName: 'Xe Ba' })],
    );
    columns.byKey[BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL]!.hasNext = true;
    renderPage();
    const needs = column('Cần xử lý');
    expect(within(needs).getAllByRole('article')).toHaveLength(3);
    fireEvent.click(within(needs).getByRole('button', { name: 'Tải thêm' }));
    expect(columns.fetchNextPage).toHaveBeenCalledWith(
      BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    );
  });

  it('cột trống nói câu của chặng đó', () => {
    renderPage();
    expect(within(column('Đang thuê')).getByText('Không có xe nào đang cho thuê')).toBeTruthy();
  });
});

describe('Tay nắm kéo — chỉ ở thẻ có bước kế mà người xem làm được', () => {
  function seedAll() {
    seed(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [
      request({ id: 'r-open', vehicleName: 'Kia Carnival' }),
      request({
        id: 'r-late',
        vehicleName: 'Mazda CX5',
        respondBy: new Date(Date.now() - 60_000).toISOString(),
      }),
    ]);
    seed(BOOKING_REQUEST_STATUS.AWAITING_HOLD, [
      request({
        id: 'r-hold',
        vehicleName: 'Honda City',
        status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
        decidedAt: new Date().toISOString(),
        holdExpiresAt: new Date(Date.now() + HOUR).toISOString(),
      }),
    ]);
    seed(BOOKING_LIST_PRESET.AWAITING_PICKUP, [
      booking({ id: 'b-pick', vehicleName: 'Toyota Vios' }),
    ]);
    seed(BOOKING_LIST_PRESET.RENTING, [
      booking({
        id: 'b-rent',
        vehicleName: 'Hyundai Accent',
        status: BOOKING_STATUS.ACTIVE,
        pickupAt: new Date(Date.now() - 24 * HOUR).toISOString(),
      }),
    ]);
  }
  const handle = (vehicle: string) =>
    screen.queryByRole('button', { name: `Kéo thẻ ${vehicle} sang bước tiếp theo` });

  it('yêu cầu còn hạn · chờ thanh toán · chờ giao có tay nắm; quá hạn phản hồi và đang thuê thì không', () => {
    seedAll();
    renderPage();
    expect(handle('Kia Carnival')).toBeTruthy();
    expect(handle('Mazda CX5')).toBeNull();
    expect(handle('Honda City')).toBeTruthy();
    expect(handle('Toyota Vios')).toBeTruthy();
    expect(handle('Hyundai Accent')).toBeNull();
  });

  it('thiếu quyền duyệt / quyền bàn giao ⇒ không có tay nắm, cũng không có dòng gợi ý kéo thả', () => {
    seedAll();
    permissions.granted.delete(PERMISSION.BOOKING_REQUEST_APPROVE);
    permissions.granted.delete(PERMISSION.HANDOVER_CONFIRM);
    renderPage();
    for (const vehicle of ['Kia Carnival', 'Honda City', 'Toyota Vios']) {
      expect(handle(vehicle)).toBeNull();
    }
    expect(screen.queryByText('Chỉ kéo được sang bước tiếp theo')).toBeNull();
  });

  it('thẻ Kanban vẫn đủ nút như List: Từ chối + Xác nhận, Xử lý giao xe là link tới trang chi tiết', () => {
    seedAll();
    renderPage();
    const needs = column('Cần xử lý');
    expect(within(needs).getAllByRole('button', { name: 'Xác nhận' }).length).toBeGreaterThan(0);
    expect(within(needs).getAllByRole('button', { name: 'Từ chối' }).length).toBeGreaterThan(0);
    const pickup = within(column('Chờ giao xe')).getByRole('link', { name: 'Xử lý giao xe' });
    expect(pickup.getAttribute('href')).toContain(bookingPath.detail('b-pick'));
  });
});

/*
 * Kéo bằng BÀN PHÍM (Space nhấc · mũi tên phải sang cột kế · Space thả) — cùng đường xử lý lượt thả
 * với chuột. jsdom không đo bố cục, nên cho mỗi cột một hình chữ nhật cạnh nhau rộng 300px.
 */
describe('Thả thẻ = bấm đúng nút của thẻ', () => {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
      const sections = [
        ...document.querySelectorAll<HTMLElement>('section[aria-labelledby^="rentals-board-"]'),
      ];
      const section = this.closest<HTMLElement>('section[aria-labelledby^="rentals-board-"]');
      const index = section ? sections.indexOf(section) : -1;
      if (index < 0) return realRect.call(this);
      const left = index * 320;
      const box =
        this === section
          ? { left, top: 0, width: 300, height: 1200 }
          : { left: left + 10, top: 120, width: 280, height: 300 };
      return {
        ...box,
        x: box.left,
        y: box.top,
        right: box.left + box.width,
        bottom: box.top + box.height,
        toJSON: () => box,
      } as DOMRect;
    };
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
  });

  async function keyboardDrag(handleName: string, steps: number) {
    const grip = screen.getByRole('button', { name: handleName });
    grip.focus();
    await act(async () => {
      fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    for (let i = 0; i < steps; i += 1) {
      await act(async () => {
        fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    await act(async () => {
      fireEvent.keyDown(document, { code: 'Space', key: ' ' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('Cần xử lý → Chờ khách thanh toán: MỞ hộp Phê duyệt, chưa gọi duyệt', async () => {
    seed(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [
      request({ id: 'r-open', vehicleName: 'Kia Carnival' }),
    ]);
    renderPage();
    await keyboardDrag('Kéo thẻ Kia Carnival sang bước tiếp theo', 1);
    await waitFor(() => expect(screen.getByText(/Phê duyệt yêu cầu thuê xe/)).toBeTruthy());
    expect(mutations.idle.mutate).not.toHaveBeenCalled();
  });

  it('Chờ giao xe → Đang thuê: mở TRANG chi tiết để giao xe', async () => {
    seed(BOOKING_LIST_PRESET.AWAITING_PICKUP, [
      booking({ id: 'b-pick', vehicleName: 'Toyota Vios' }),
    ]);
    renderPage();
    await keyboardDrag('Kéo thẻ Toyota Vios sang bước tiếp theo', 1);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(bookingPath.detail('b-pick')));
  });

  it('Chờ khách thanh toán → Chờ giao xe bị KHOÁ: không mở gì, nói vì sao', async () => {
    seed(BOOKING_REQUEST_STATUS.AWAITING_HOLD, [
      request({
        id: 'r-hold',
        vehicleName: 'Honda City',
        status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
        decidedAt: new Date().toISOString(),
        holdExpiresAt: new Date(Date.now() + HOUR).toISOString(),
      }),
    ]);
    renderPage();
    await keyboardDrag('Kéo thẻ Honda City sang bước tiếp theo', 1);
    await waitFor(() =>
      expect(
        screen.getByText('Chuyến chỉ sang "Chờ giao xe" khi khách thanh toán đủ tiền giữ chỗ.'),
      ).toBeTruthy(),
    );
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('nhảy cóc hai cột không làm gì', async () => {
    seed(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, [
      request({ id: 'r-open', vehicleName: 'Kia Carnival' }),
    ]);
    renderPage();
    await keyboardDrag('Kéo thẻ Kia Carnival sang bước tiếp theo', 2);
    await waitFor(() =>
      expect(screen.getByText('Chỉ kéo được thẻ sang bước tiếp theo.')).toBeTruthy(),
    );
    expect(screen.queryByText(/Phê duyệt yêu cầu thuê xe/)).toBeNull();
  });
});
