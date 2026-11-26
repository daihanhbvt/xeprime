import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, PERMISSION, type Permission } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';

import { CalendarScheduler } from './CalendarScheduler';
import type { CalendarEvent, CalendarResource } from '../types/calendar.types';

/**
 * Test hành vi cho lịch thuê xe (bản thiết kế lại).
 *
 * Khoá các hợp đồng nghiệp vụ:
 *  - ô trống mở BỘ CHỌN hành động, và danh sách hành động đi theo quyền — không thao tác nào
 *    chạy thẳng từ một cú bấm ô;
 *  - bấm event mở modal chi tiết đúng loại (không điều hướng rời trang);
 *  - kéo chuột qua nhiều ô cùng hàng mở bảng cho CẢ khoảng (thiết kế lại 25/11/2026);
 *  - yêu cầu chờ duyệt hiện trên lưới nhưng không làm ngày thành "đã có lịch";
 *  - thiếu toàn bộ quyền thao tác thì ô không phải là nút.
 * KHÔNG khẳng định trên cấu trúc DOM tình cờ.
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
// Ô lọc chi nhánh đọc server (ADR 0052) — chặn ở tầng hook như mọi hook dữ liệu khác ở bộ này.
vi.mock(
  '@/features/branches/hooks/use-branch-filter',
  () => import('@/features/branches/test-utils'),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => '/manage/calendar',
  useSearchParams: () => nav.params,
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: Permission) => permissions.granted.has(p),
    hasAny: () => permissions.granted.size > 0,
    isLoading: false,
  }),
}));

// Tuyến của gian hàng đọc từ `/auth/me` — lập đơn tay chỉ có ở tuyến gói (26/10/2026).
const me = vi.hoisted(() => ({ billingMode: 'package' as string }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { tenant: { billingMode: me.billingMode } } }),
}));

// Virtualizer đo bằng kích thước thật của DOM — jsdom không có layout nên trả thẳng mọi hàng.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 64,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: 56 + index * 64,
        size: 64,
      })),
    options: { scrollMargin: 56 },
    measure: () => undefined,
  }),
}));

/** Dialog con mock thành marker — test scheduler chỉ cần biết ĐÚNG dialog nào được mở. */
vi.mock('@/features/bookings/components/BookingDetailDialog', () => ({
  BookingDetailDialog: ({ bookingId, open }: { bookingId: string; open: boolean }) =>
    open ? <div data-testid="booking-detail-dialog">{bookingId}</div> : null,
}));
vi.mock('@/features/booking-requests/components/StaffBookingDialog', () => ({
  StaffBookingDialog: ({
    open,
    vehicleId,
    pickupAt,
    returnAt,
  }: {
    open: boolean;
    vehicleId?: string;
    pickupAt?: string;
    returnAt?: string;
  }) =>
    open ? (
      <div data-testid="booking-form-dialog" data-range={`${pickupAt ?? ''}/${returnAt ?? ''}`}>
        {vehicleId ?? ''}
      </div>
    ) : null,
}));
vi.mock('./CalendarRequestDialog', () => ({
  CalendarRequestDialog: ({ requestId }: { requestId: string }) => (
    <div data-testid="request-dialog">{requestId}</div>
  ),
}));
vi.mock('@/features/booking-requests/hooks/use-booking-request-decisions', () => ({
  useBookingRequestDecisions: () => ({
    openApprove: vi.fn(),
    openReject: vi.fn(),
    openCancel: vi.fn(),
    decisionActionFor: () => null,
    dialogs: null,
  }),
}));
// Thẻ xem nhanh nạp chi tiết đơn khi mở (SĐT đi qua cổng của chi tiết đơn) — không cần ở đây.
vi.mock('@/features/bookings/hooks/use-booking', () => ({
  useBooking: () => ({ data: undefined }),
}));
vi.mock('./VehicleBlockDialog', () => ({
  VehicleBlockDialog: ({
    state,
  }: {
    state: { vehicleId?: string; date?: string; endDate?: string } | null;
  }) =>
    state ? (
      <div data-testid="block-dialog">{`${state.vehicleId}:${state.date}:${state.endDate}`}</div>
    ) : null,
}));
vi.mock('./VehicleBlockDetailDialog', () => ({
  VehicleBlockDetailDialog: ({ blockId, open }: { blockId: string; open: boolean }) =>
    open ? <div data-testid="block-detail-dialog">{blockId}</div> : null,
}));
vi.mock('./DailyPriceDialog', () => ({
  DailyPriceDialog: ({
    state,
  }: {
    state: { vehicleId: string; date: string; endDate?: string } | null;
  }) =>
    state ? (
      <div data-testid="price-dialog">{`${state.vehicleId}:${state.date}:${state.endDate}`}</div>
    ) : null,
}));
vi.mock('./MaintenanceEventDialog', () => ({
  MaintenanceEventDialog: ({ recordId, open }: { recordId: string; open: boolean }) =>
    open ? <div data-testid="maintenance-dialog">{recordId}</div> : null,
}));

/** Hai dialog hàng loạt mock thành marker — test scheduler chỉ cần biết ĐÚNG cái nào mở ra. */
vi.mock('./BulkDayBlockDialog', () => ({
  BulkDayBlockDialog: ({ state }: { state: { date: string } | null }) =>
    state ? <div data-testid="bulk-block-dialog">{state.date}</div> : null,
}));
vi.mock('./BulkDayPriceDialog', () => ({
  BulkDayPriceDialog: ({ state }: { state: { date: string } | null }) =>
    state ? <div data-testid="bulk-price-dialog">{state.date}</div> : null,
}));

const bulk = vi.hoisted(() => ({
  activeBatchId: null as string | null,
  vehicles: [] as Array<{ vehicleId: string; busyDates: string[] }>,
  release: vi.fn(),
  block: vi.fn(),
}));
vi.mock('../hooks/use-bulk-day', () => ({
  useBulkDayPreview: () => ({
    data: {
      activeBlockBatchId: bulk.activeBatchId,
      vehicles: bulk.vehicles,
      dayCount: 1,
    },
    isLoading: false,
    isError: false,
  }),
  useReleaseBulkBlock: () => ({ mutate: bulk.release, isPending: false }),
  useBulkBlockDay: () => ({ mutate: bulk.block, isPending: false }),
}));

const data = vi.hoisted(() => ({
  resources: [] as unknown[],
  eventsByResource: new Map<string, unknown[]>(),
  priceMarkers: new Map<string, { dailyPrice: string | null; hourlyPrice: string | null }>(),
  isLoading: false,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
}));

/** Khoảng cố định 3 ngày 12–14/10/2026 (00:00 VN = 17:00Z hôm trước). */
const RANGE = {
  startAt: new Date('2026-10-11T17:00:00.000Z'),
  endAt: new Date('2026-10-14T17:00:00.000Z'),
  dayCount: 3,
};

vi.mock('../hooks/use-calendar-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/use-calendar-data')>()),
  useCalendarData: () => ({
    range: RANGE,
    filters: { from: '2026-10-12', days: 3, vehicleType: null, q: null },
    ...data,
  }),
}));

/**
 * Ngày lễ nạp RIÊNG (`useCalendarHolidays`), và mock riêng ở đây cũng là một khẳng định: lịch
 * phải dựng được mà không cần lớp ngày lễ nào — mặc định là bản đồ RỖNG cho mọi test cũ.
 */
const holidays = vi.hoisted(() => ({ byDay: new Map<string, unknown>() }));
vi.mock('../hooks/use-calendar-holidays', () => ({
  useCalendarHolidays: () => holidays.byDay,
}));

function resource(over: Partial<CalendarResource> = {}): CalendarResource {
  return {
    id: 'veh-1',
    vehicleId: 'veh-1',
    name: 'Toyota Vios 2023',
    code: 'XP-0001',
    plateNumber: '51G-123.45',
    mainImageUrl: null,
    weekdayPrice: '750000',
    hourlyPrice: null,
    vehicleType: 'car',
    operationStatus: 'available',
    ...over,
  } as CalendarResource;
}

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'occ-1',
    resourceId: 'veh-1',
    type: 'booking',
    title: 'DH9912 · Nguyễn Minh Tuấn',
    customerName: 'Nguyễn Minh Tuấn',
    startAt: '2026-10-12T01:00:00.000Z',
    endAt: '2026-10-13T01:00:00.000Z',
    status: 'reserved',
    sourceId: 'bk-1',
    occupying: true,
    code: 'DH9912',
    serviceType: 'self_drive',
    amount: '750000',
    ...over,
  } as CalendarEvent;
}

function renderScheduler() {
  return render(
    <App>
      <CalendarScheduler />
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.CALENDAR_VIEW,
    PERMISSION.BOOKING_CREATE,
    PERMISSION.VEHICLE_BLOCK_SCHEDULE,
    PERMISSION.VEHICLE_UPDATE,
  ]);
  me.billingMode = BILLING_MODE.PACKAGE;
  data.resources = [resource()];
  data.eventsByResource = new Map();
  data.priceMarkers = new Map();
  data.isLoading = false;
  data.isFetching = false;
  data.error = null;
  holidays.byDay = new Map();
  bulk.activeBatchId = null;
  bulk.vehicles = [
    { vehicleId: 'veh-1', busyDates: [] },
    { vehicleId: 'veh-2', busyDates: [] },
  ];
  bulk.release = vi.fn();
  bulk.block = vi.fn();
});
afterEach(cleanup);

describe('CalendarScheduler - lưới điều phối đội xe', () => {
  it('đầu trang có tiêu đề + "Tạo đơn thuê" mở bước chọn xe', () => {
    renderScheduler();
    expect(screen.getByRole('heading', { level: 1, name: 'Lịch thuê xe' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tạo đơn thuê/ }));
    // Chưa biết xe ⇒ hộp lập đơn mở ở bước chọn xe (không có vehicleId).
    expect(screen.getByTestId('booking-form-dialog').textContent).toBe('');
  });

  it('chủ xe tuyến HOA HỒNG cũng có nút "Tạo đơn thuê" (ADR 0110)', () => {
    me.billingMode = BILLING_MODE.COMMISSION;
    renderScheduler();
    expect(screen.getByRole('button', { name: /Tạo đơn thuê/ })).toBeTruthy();
  });

  it('thiếu quyền bookings.create thì không có nút "Tạo đơn thuê"', () => {
    permissions.granted = new Set([PERMISSION.CALENDAR_VIEW]);
    renderScheduler();
    expect(screen.queryByRole('button', { name: /Tạo đơn thuê/ })).toBeNull();
  });

  it('cột xe hiện đủ nhận diện: tên, biển số, giá ngày; góc lưới đếm xe theo loại', () => {
    data.resources = [
      resource(),
      resource({
        id: 'veh-2',
        vehicleId: 'veh-2',
        name: 'Honda Vision',
        plateNumber: '59X1-888.88',
        weekdayPrice: '150000',
        vehicleType: 'motorbike',
      }),
    ];
    renderScheduler();
    expect(screen.getByText('Toyota Vios 2023')).toBeTruthy();
    expect(screen.getByText(/51G-123\.45/)).toBeTruthy();
    expect(screen.getByText('1 ô tô, 1 xe máy')).toBeTruthy();
    // Đội xe ≤ 4 xe: giá GỌN giữ dòng riêng - dòng chứa giá là cột chữ của ô xe, mở đầu bằng TÊN xe.
    const price = screen.getByText('750k');
    expect(price.parentElement?.parentElement?.firstElementChild?.textContent).toBe(
      'Toyota Vios 2023',
    );
  });

  it('đội xe > 4 xe: giá gọn đứng cùng dòng biển số', () => {
    data.resources = [1, 2, 3, 4, 5].map((n) =>
      resource({
        id: `veh-${n}`,
        vehicleId: `veh-${n}`,
        name: `Xe ${n}`,
        plateNumber: `51G-000.0${n}`,
      }),
    );
    renderScheduler();
    const prices = screen.getAllByText('750k');
    expect(prices.length).toBeGreaterThan(0);
    // Dòng chứa giá mở đầu bằng BIỂN SỐ, không phải tên xe.
    expect(prices[0]!.parentElement?.parentElement?.firstElementChild?.textContent).toMatch(
      /^51G-000\.0\d$/,
    );
  });

  it('hàng "Xe còn trống" đã gỡ khỏi lưới (thiết kế lại 25/11/2026)', () => {
    renderScheduler();
    expect(screen.queryByText('Xe còn trống')).toBeNull();
  });

  it('bấm ô trống mở bộ chọn hành động với ĐỦ ba lựa chọn khi đủ quyền - chưa chạy gì cả', () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Đặt xe')).toBeTruthy();
    expect(within(menu).getByText('Khóa xe')).toBeTruthy();
    expect(within(menu).getByText('Đặt giá riêng')).toBeTruthy();
    // Ngày không có lịch chiếm chỗ ⇒ "Ngày trống".
    expect(within(menu).getByText(/Ngày trống/)).toBeTruthy();
    // Chỉ mở menu — không dialog nghiệp vụ nào tự chạy.
    expect(screen.queryByTestId('booking-form-dialog')).toBeNull();
    expect(screen.queryByTestId('block-dialog')).toBeNull();
  });

  it('quyền quyết định lựa chọn: chỉ có block_schedule thì menu không mời Đặt xe/Đặt giá', () => {
    permissions.granted = new Set([PERMISSION.CALENDAR_VIEW, PERMISSION.VEHICLE_BLOCK_SCHEDULE]);
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Khóa xe')).toBeTruthy();
    expect(within(menu).queryByText('Đặt xe')).toBeNull();
    expect(within(menu).queryByText('Đặt giá riêng')).toBeNull();
  });

  it('chủ xe tuyến HOA HỒNG lập được đơn tay - ô mời đủ Đặt xe/Khóa xe/Đặt giá (ADR 0110)', () => {
    me.billingMode = BILLING_MODE.COMMISSION;
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Đặt xe')).toBeTruthy();
    expect(within(menu).getByText('Khóa xe')).toBeTruthy();
    expect(within(menu).getByText('Đặt giá riêng')).toBeTruthy();
  });

  it('không còn quyền thao tác nào thì ô KHÔNG phải nút - người chỉ xem không bị mời bấm', () => {
    permissions.granted = new Set([PERMISSION.CALENDAR_VIEW]);
    renderScheduler();
    expect(screen.queryByLabelText(/Tạo lịch cho Toyota Vios 2023/)).toBeNull();
  });

  it('chọn "Đặt xe" mở form tạo đơn với đúng xe, nhận 8h ngày bấm - trả 8h hôm sau', () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/));
    fireEvent.click(screen.getByText('Đặt xe'));
    const dialog = screen.getByTestId('booking-form-dialog');
    expect(dialog.textContent).toBe('veh-1');
    // 08:00 VN = 01:00Z.
    expect(dialog.getAttribute('data-range')).toBe(
      '2026-10-12T01:00:00.000Z/2026-10-13T01:00:00.000Z',
    );
  });

  it('chọn "Đặt giá riêng" mở dialog giá với đúng xe + ngày', () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 14\/10/));
    fireEvent.click(screen.getByText('Đặt giá riêng'));
    expect(screen.getByTestId('price-dialog').textContent).toBe('veh-1:2026-10-14:2026-10-14');
  });

  it('bấm thẻ đơn thuê mở MODAL chi tiết (không điều hướng)', () => {
    data.eventsByResource = new Map([['veh-1', [event()]]]);
    renderScheduler();
    fireEvent.click(screen.getByRole('button', { name: /Nguyễn Minh Tuấn, DH9912/ }));
    expect(screen.getByTestId('booking-detail-dialog').textContent).toBe('bk-1');
  });

  it('thẻ đơn hiện chip nhóm "Đơn thuê xe", mã đơn và số tiền', () => {
    data.eventsByResource = new Map([['veh-1', [event({ status: 'active' })]]]);
    renderScheduler();
    const bar = screen.getByRole('button', { name: /Nguyễn Minh Tuấn, DH9912/ });
    expect(within(bar).getByText('Đang thuê')).toBeTruthy();
    expect(within(bar).getByText('#DH9912')).toBeTruthy();
    expect(within(bar).getByText(/750\.000/)).toBeTruthy();
  });

  it('yêu cầu CHỜ DUYỆT hiện chip "Cần xử lý" và mở hộp chi tiết YÊU CẦU', () => {
    data.eventsByResource = new Map([
      [
        'veh-1',
        [
          event({
            id: 'req-1',
            type: 'booking_request',
            status: 'pending_host_approval',
            occupying: false,
            code: null,
            amount: null,
            sourceId: 'req-1',
            customerName: 'Lê Văn Hỏi',
          }),
        ],
      ],
    ]);
    renderScheduler();
    const bar = screen.getByRole('button', { name: /^Cần xử lý, Lê Văn Hỏi/ });
    fireEvent.click(bar);
    expect(screen.getByTestId('request-dialog').textContent).toBe('req-1');
  });

  it('yêu cầu chờ duyệt KHÔNG làm ngày thành "Đã có lịch" (không chiếm lịch - ADR 0044)', () => {
    data.eventsByResource = new Map([
      [
        'veh-1',
        [
          event({
            type: 'booking_request',
            status: 'pending_host_approval',
            occupying: false,
            startAt: '2026-10-13T01:00:00.000Z',
            endAt: '2026-10-14T01:00:00.000Z',
          }),
        ],
      ],
    ]);
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 13\/10/));
    expect(within(screen.getByRole('menu')).getByText(/Ngày trống/)).toBeTruthy();
  });

  it('ngày có đơn chiếm chỗ thì bảng thao tác nói "Đã có lịch"', () => {
    data.eventsByResource = new Map([['veh-1', [event()]]]);
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/));
    expect(within(screen.getByRole('menu')).getByText(/Đã có lịch/)).toBeTruthy();
  });

  it('event khoá xe và bảo dưỡng mở đúng dialog của chúng', () => {
    data.eventsByResource = new Map([
      [
        'veh-1',
        [
          event({
            id: 'occ-b',
            type: 'blocked_range',
            title: 'Xe bị khóa',
            status: 'repair',
            sourceId: 'blk-9',
            customerName: null,
            code: null,
          }),
          event({
            id: 'occ-m',
            type: 'maintenance',
            title: 'Bảo dưỡng',
            status: null,
            sourceId: 'mnt-7',
            customerName: null,
            code: null,
            startAt: '2026-10-13T01:00:00.000Z',
            endAt: '2026-10-14T01:00:00.000Z',
          }),
        ],
      ],
    ]);
    renderScheduler();

    fireEvent.click(screen.getByRole('button', { name: /^Đã khóa/ }));
    expect(screen.getByTestId('block-detail-dialog').textContent).toBe('blk-9');

    fireEvent.click(screen.getByRole('button', { name: /^Bảo dưỡng/ }));
    expect(screen.getByTestId('maintenance-dialog').textContent).toBe('mnt-7');
  });

  it('đơn chỉ vài tiếng vẫn có thẻ đủ rộng để đọc/bấm - sàn bề rộng, không phải vệt vài px', () => {
    data.eventsByResource = new Map([
      [
        'veh-1',
        [event({ startAt: '2026-10-12T01:00:00.000Z', endAt: '2026-10-12T03:00:00.000Z' })],
      ],
    ]);
    renderScheduler();
    const bar = screen.getByRole('button', { name: /Nguyễn Minh Tuấn, DH9912/ });
    expect(parseFloat(bar.style.getPropertyValue('--xp-bar-width'))).toBeGreaterThanOrEqual(56);
  });

  /*
   * Hồi quy 26/11/2026: thẻ từng đặt theo tỉ lệ giờ, nên chuyến 13h cùng ngày với chuyến 08h bị vẽ
   * lệch sang ngày kế. Nay thẻ nằm theo Ô NGÀY: hai chuyến cùng ngày ở cùng một ô, xếp hai tầng.
   */
  it('hai chuyến CÙNG một ngày (08h và 13h) nằm trong cùng một ô ngày, xếp hai tầng', () => {
    data.eventsByResource = new Map([
      [
        'veh-1',
        [
          event({
            id: 'a',
            title: 'DH1 · A',
            code: 'DH1',
            customerName: 'A',
            startAt: '2026-10-12T01:00:00.000Z',
            endAt: '2026-10-12T05:00:00.000Z',
          }),
          event({
            id: 'b',
            title: 'DH2 · B',
            code: 'DH2',
            customerName: 'B',
            startAt: '2026-10-12T06:00:00.000Z',
            endAt: '2026-10-12T10:00:00.000Z',
          }),
        ],
      ],
    ]);
    renderScheduler();
    const bar = (name: RegExp) => screen.getByRole('button', { name });
    const css = (el: HTMLElement, prop: string) => parseFloat(el.style.getPropertyValue(prop));
    const a = bar(/^Chờ giao xe, A/);
    const b = bar(/^Chờ giao xe, B/);
    // Ô 96px (sàn): cả hai thẻ trọn trong CÙNG một ô.
    const cellOf = (el: HTMLElement) => Math.floor(css(el, '--xp-bar-left') / 96);
    expect(cellOf(b)).toBe(cellOf(a));
    expect(css(b, '--xp-bar-left') + css(b, '--xp-bar-width')).toBeLessThanOrEqual(
      (cellOf(a) + 1) * 96,
    );
    expect(css(b, '--xp-bar-top')).toBeGreaterThan(css(a, '--xp-bar-top'));
  });

  it('hai đơn chồng chỗ trên một hàng xếp hai TẦNG, hàng cao thêm', () => {
    data.eventsByResource = new Map([
      [
        'veh-1',
        [
          event({ id: 'a', title: 'DH1 · A', code: 'DH1', customerName: 'A' }),
          event({ id: 'b', title: 'DH2 · B', code: 'DH2', customerName: 'B' }),
        ],
      ],
    ]);
    renderScheduler();
    const top = (name: RegExp) =>
      parseFloat(screen.getByRole('button', { name }).style.getPropertyValue('--xp-bar-top'));
    expect(top(/^Chờ giao xe, B/)).toBeGreaterThan(top(/^Chờ giao xe, A/));
  });

  it('thu gọn cột phương tiện: chỉ còn ảnh, mở lại là đủ chữ', () => {
    renderScheduler();
    expect(screen.getByText('Toyota Vios 2023')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn cột phương tiện' }));
    expect(screen.queryByText('Toyota Vios 2023')).toBeNull();
    expect(screen.getByRole('button', { name: 'Thông tin xe Toyota Vios 2023' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng cột phương tiện' }));
    expect(screen.getByText('Toyota Vios 2023')).toBeTruthy();
  });

  it('bấm ô xe mở thẻ thông tin xe, có nút X để đóng (mobile không có "rời chuột")', async () => {
    renderScheduler();
    fireEvent.click(screen.getByRole('button', { name: 'Thông tin xe Toyota Vios 2023' }));

    expect(await screen.findByText('Thông tin xe')).toBeTruthy();
    expect(screen.getByText('XP-0001')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => {
      const card = screen.queryByText('Thông tin xe');
      expect(card === null || card.closest('.ant-popover-hidden') != null).toBe(true);
    });
  });

  it('khoảng không có lịch: lưới VẪN hiện và bấm được, không có dòng gợi ý chen giữa (26/11/2026)', () => {
    renderScheduler();
    expect(screen.queryByText(/Chưa có lịch trong khoảng này/)).toBeNull();
    expect(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/)).toBeTruthy();
  });

  it('ô có giá riêng nói ra trong nhãn trợ năng - không chỉ là một mảng màu', () => {
    data.priceMarkers = new Map([
      ['veh-1:2026-10-12', { dailyPrice: '1200000', hourlyPrice: null }],
    ]);
    renderScheduler();
    expect(
      screen.getByLabelText(
        /Tạo lịch cho Toyota Vios 2023 ngày 12\/10\/2026 · Giá riêng: 1\.200\.000/,
      ),
    ).toBeTruthy();
  });

  it('thiếu calendar.view thì chặn từ ngoài cửa', () => {
    permissions.granted = new Set();
    renderScheduler();
    expect(screen.getByText('Không có quyền xem lịch xe')).toBeTruthy();
  });
});

/**
 * KÉO CHUỘT chọn nhiều ngày (thiết kế lại 25/11/2026) — tính năng mới của đợt này.
 *
 * jsdom không có bố cục: mọi rect = 0, ô rộng 96px (sàn desktop) ⇒ cột dưới con trỏ =
 * `floor(clientX / 96)`. Thả chuột mở bảng thao tác cho CẢ khoảng; ba hành động nhận đúng khoảng.
 */
describe('CalendarScheduler - kéo chọn nhiều ngày', () => {
  function dragAcross(fromLabel: RegExp, toClientX: number) {
    const cell = screen.getByLabelText(fromLabel);
    fireEvent.pointerDown(cell, { pointerType: 'mouse', button: 0, clientX: 10 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: toClientX });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: toClientX });
    // Trình duyệt phát `click` sau pointerup — nó KHÔNG được mở bảng lần hai.
    fireEvent.click(cell);
  }

  it('kéo từ 12/10 sang 14/10 mở MỘT bảng cho cả ba ngày', () => {
    renderScheduler();
    dragAcross(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/, 250);

    const menus = screen.getAllByRole('menu');
    expect(menus).toHaveLength(1);
    expect(within(menus[0]!).getByText(/12\/10 - 14\/10 · 3 ngày/)).toBeTruthy();
    expect(within(menus[0]!).getByText('Từ ngày 12/10 → 15/10')).toBeTruthy();
    expect(within(menus[0]!).getByText('Ngừng nhận đặt xe những ngày này')).toBeTruthy();
  });

  it('"Đặt xe" cho khoảng kéo: nhận 8h ngày đầu, trả 8h sáng sau ngày cuối', () => {
    renderScheduler();
    dragAcross(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/, 250);
    fireEvent.click(screen.getByText('Đặt xe'));
    expect(screen.getByTestId('booking-form-dialog').getAttribute('data-range')).toBe(
      '2026-10-12T01:00:00.000Z/2026-10-15T01:00:00.000Z',
    );
  });

  it('"Khóa xe" và "Đặt giá riêng" nhận đúng khoảng ngày đã kéo', () => {
    renderScheduler();
    dragAcross(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/, 150);
    fireEvent.click(screen.getByText('Khóa xe'));
    expect(screen.getByTestId('block-dialog').textContent).toBe('veh-1:2026-10-12:2026-10-13');

    cleanup();
    renderScheduler();
    dragAcross(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/, 150);
    fireEvent.click(screen.getByText('Đặt giá riêng'));
    expect(screen.getByTestId('price-dialog').textContent).toBe('veh-1:2026-10-12:2026-10-13');
  });

  it('kéo NGƯỢC (từ phải sang trái) vẫn ra khoảng tăng dần', () => {
    renderScheduler();
    const cell = screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 14\/10/);
    // Mốc neo là ô 14/10; kéo về x=10 (cột 12/10).
    fireEvent.pointerDown(cell, { pointerType: 'mouse', button: 0 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 10 });
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 10 });
    expect(within(screen.getByRole('menu')).getByText(/12\/10 - 14\/10 · 3 ngày/)).toBeTruthy();
  });

  it('chạm (touch) không kéo - một cú chạm vẫn chỉ mở bảng cho đúng một ngày', () => {
    renderScheduler();
    const cell = screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/);
    fireEvent.pointerDown(cell, { pointerType: 'touch', button: 0 });
    fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 250 });
    fireEvent.pointerUp(window, { pointerType: 'touch', clientX: 250 });
    fireEvent.click(cell);
    expect(within(screen.getByRole('menu')).queryByText(/3 ngày/)).toBeNull();
    expect(within(screen.getByRole('menu')).getByText(/Ngày trống/)).toBeTruthy();
  });
});

/**
 * Lớp ngày lễ — một lớp THÔNG TIN chồng lên lưới. Ngày lễ phải nhận ra được bằng thứ KHÁC màu nền
 * (nhãn trợ năng + cờ), và KHÔNG được chặn thao tác nào.
 */
describe('CalendarScheduler - lớp ngày lễ', () => {
  const QUOC_KHANH = {
    id: 'hol-1',
    startDate: '2026-10-13',
    endDate: '2026-10-13',
    name: 'Ngày lễ thử',
    description: 'Ngày lễ công cộng',
    eventType: 'public_holiday',
    source: 'google_calendar',
    syncedAt: '2026-10-12T01:00:00.000Z',
  };

  it('header cột ngày lễ nói ra bằng NHÃN TRỢ NĂNG, không chỉ bằng màu', () => {
    holidays.byDay = new Map([['2026-10-13', QUOC_KHANH]]);
    renderScheduler();
    expect(screen.getByLabelText(/^Ngày lễ: Ngày lễ thử, ngày 13\/10\/2026/)).toBeTruthy();
  });

  it('không có ngày lễ thì header KHÔNG mọc thêm nút ngày lễ nào', () => {
    renderScheduler();
    expect(screen.queryByLabelText(/^Ngày lễ:/)).toBeNull();
  });

  it('bảng ngày lễ có TÊN và LOẠI lễ', async () => {
    holidays.byDay = new Map([['2026-10-13', QUOC_KHANH]]);
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/^Ngày lễ: Ngày lễ thử/));
    expect(await screen.findByText('Ngày lễ thử')).toBeTruthy();
    expect(screen.getByText('Nghỉ lễ chính thức')).toBeTruthy();
    expect(screen.queryByText('Lịch Google')).toBeNull();
  });

  it('ngày lễ KHÔNG chặn thao tác: ô vẫn mở bộ chọn hành động như mọi ngày khác', () => {
    holidays.byDay = new Map([['2026-10-13', QUOC_KHANH]]);
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 13\/10/));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Đặt xe')).toBeTruthy();
    expect(within(menu).getByText('Khóa xe')).toBeTruthy();
  });

  it('ô của cột ngày lễ mang thêm ngữ cảnh trong nhãn', () => {
    holidays.byDay = new Map([['2026-10-13', QUOC_KHANH]]);
    renderScheduler();
    expect(
      screen.getByLabelText('Tạo lịch cho Toyota Vios 2023 ngày 13/10/2026 · ngày lễ: Ngày lễ thử'),
    ).toBeTruthy();
  });
});

/**
 * Chú thích (design `24200:103941`): ba sắc DỊCH VỤ + Khoá/Bảo dưỡng + Giá riêng + Ngày lễ. Ô mẫu và
 * thẻ dùng CÙNG class tông — so danh tính class (CSS Module băm tên nên so bằng `includes`).
 */
describe('CalendarScheduler - chú thích', () => {
  it('liệt kê đủ sáu lớp của design', () => {
    renderScheduler();
    const legend = screen.getByLabelText('Chú giải lịch');
    for (const label of [
      'Thuê theo ngày',
      'Xe có tài xế',
      'Thuê xe dài hạn',
      'Khóa/Bảo dưỡng',
      'Giá riêng',
      'Ngày lễ',
    ]) {
      expect(within(legend).getByText(label), label).toBeTruthy();
    }
  });

  it('ô mẫu của một dịch vụ dùng đúng class tông của thẻ dịch vụ đó', () => {
    data.eventsByResource = new Map([['veh-1', [event({ serviceType: 'with_driver' })]]]);
    renderScheduler();

    const bar = screen.getByRole('button', { name: /Nguyễn Minh Tuấn, DH9912/ });
    const swatch = within(screen.getByLabelText('Chú giải lịch'))
      .getByText('Xe có tài xế')
      .querySelector('i');
    const toneOf = (el: Element | null) =>
      [...(el?.classList ?? [])].filter((cls) => cls.includes('tone'));

    expect(toneOf(swatch)).not.toHaveLength(0);
    expect(toneOf(swatch)).toEqual(toneOf(bar));
  });
});

/**
 * Bảng hành động của một ngày (bấm header ngày) — design không vẽ, GIỮ theo chốt 25/11/2026.
 */
describe('CalendarScheduler - bảng hành động của một ngày', () => {
  it('bấm header ngày lễ mở bảng - HOVER thì không', async () => {
    holidays.byDay = new Map([
      [
        '2026-10-13',
        {
          id: 'hol-1',
          startDate: '2026-10-13',
          endDate: '2026-10-13',
          name: 'Ngày lễ thử',
          description: 'Ngày lễ',
          eventType: 'public_holiday',
          source: 'google_calendar',
          syncedAt: '2026-10-12T01:00:00.000Z',
        },
      ],
    ]);
    renderScheduler();
    const trigger = screen.getByLabelText(/^Ngày lễ: Ngày lễ thử/);
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByText('Khóa xe nhanh')).toBeNull();
    fireEvent.click(trigger);
    expect(await screen.findByText('Khóa xe nhanh')).toBeTruthy();
  });

  it('NGÀY THƯỜNG cũng mở được bảng - khoá xe và đặt giá là việc quanh năm', async () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText('Thao tác cho ngày 12/10/2026'));
    expect(await screen.findByText('Khóa xe nhanh')).toBeTruthy();
    expect(screen.getByText('Giá riêng toàn bộ xe')).toBeTruthy();
  });

  it('chọn "Giá riêng toàn bộ xe" mở dialog đặt giá đúng ngày', async () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText('Thao tác cho ngày 12/10/2026'));
    fireEvent.click(await screen.findByText('Giá riêng toàn bộ xe'));
    expect(screen.getByTestId('bulk-price-dialog').textContent).toBe('2026-10-12');
  });

  it('gạt công tắc KHOÁ NGAY - không bắt đi qua modal', async () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText('Thao tác cho ngày 12/10/2026'));
    fireEvent.click(await screen.findByRole('switch', { name: 'Khóa xe nhanh' }));
    expect(bulk.block).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-10-12',
        to: '2026-10-12',
        vehicleIds: ['veh-1', 'veh-2'],
      }),
      expect.anything(),
    );
    expect(screen.queryByTestId('bulk-block-dialog')).toBeNull();
  });

  it('không xe nào rảnh thì công tắc không gửi lệnh rỗng', async () => {
    bulk.vehicles = [{ vehicleId: 'veh-1', busyDates: ['2026-10-12'] }];
    renderScheduler();
    fireEvent.click(screen.getByLabelText('Thao tác cho ngày 12/10/2026'));
    fireEvent.click(await screen.findByRole('switch', { name: 'Khóa xe nhanh' }));
    expect(bulk.block).not.toHaveBeenCalled();
  });

  it('bấm liên kết "Khóa nhiều ngày" mở MODAL, KHÔNG khoá thẳng', async () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText('Thao tác cho ngày 12/10/2026'));
    fireEvent.click(await screen.findByText('Khóa nhiều ngày'));
    expect(screen.getByTestId('bulk-block-dialog').textContent).toBe('2026-10-12');
    expect(bulk.block).not.toHaveBeenCalled();
  });

  it('thiếu cả hai quyền thì ngày THƯỜNG không phải nút', () => {
    permissions.granted = new Set([PERMISSION.CALENDAR_VIEW]);
    renderScheduler();
    expect(screen.queryByLabelText('Thao tác cho ngày 12/10/2026')).toBeNull();
  });

  it('thiếu quyền khoá thì bảng chỉ mời Đặt giá', async () => {
    permissions.granted = new Set([PERMISSION.CALENDAR_VIEW, PERMISSION.VEHICLE_UPDATE]);
    renderScheduler();
    fireEvent.click(screen.getByLabelText('Thao tác cho ngày 12/10/2026'));
    expect(await screen.findByText('Giá riêng toàn bộ xe')).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Khóa xe nhanh' })).toBeNull();
  });
});

/**
 * Bản TIẾNG ANH của chính màn này — chứng minh bó `en` đủ khoá, đúng biến ICU.
 */
describe('CalendarScheduler - bản tiếng Anh', () => {
  function renderEnglish() {
    return renderWithIntl(
      <App>
        <CalendarScheduler />
      </App>,
      { locale: 'en' },
    );
  }

  it('chữ của lưới và chú thích ra tiếng Anh, không rơi về khoá message', () => {
    data.eventsByResource = new Map([['veh-1', [event({ status: 'active' })]]]);
    renderEnglish();

    expect(screen.getByLabelText('Vehicle rental calendar by day')).toBeTruthy();
    const legend = screen.getByLabelText('Calendar legend');
    expect(within(legend).getByText('Daily rental')).toBeTruthy();
    expect(within(legend).getByText('Holiday')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Rental calendar' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Calendar\.[a-z]/i);
  });

  it('số nhiều ICU đúng ở tiếng Anh: 1 car khác 3 motorbikes', () => {
    data.resources = [
      resource(),
      resource({ id: 'b1', vehicleId: 'b1', vehicleType: 'motorbike' }),
      resource({ id: 'b2', vehicleId: 'b2', vehicleType: 'motorbike' }),
      resource({ id: 'b3', vehicleId: 'b3', vehicleType: 'motorbike' }),
    ];
    renderEnglish();
    expect(screen.getByText('1 car, 3 motorbikes')).toBeTruthy();
  });

  it('bảng ngày tiếng Anh lấy nhãn loại lễ từ namespace Domain', async () => {
    holidays.byDay = new Map([
      [
        '2026-10-13',
        {
          id: 'hol-1',
          startDate: '2026-10-13',
          endDate: '2026-10-13',
          name: 'Test holiday',
          description: 'Ngày lễ',
          eventType: 'public_holiday',
          source: 'google_calendar',
          syncedAt: '2026-10-12T01:00:00.000Z',
        },
      ],
    ]);
    renderEnglish();
    // Ngày trong nhãn theo NGÔN NGỮ: tiếng Anh viết tháng trước.
    fireEvent.click(screen.getByLabelText(/^Holiday: Test holiday, on 10\/13\/2026/));
    expect(await screen.findByText('Official public holiday')).toBeTruthy();
    expect(screen.getByText('Quick block')).toBeTruthy();
    expect(screen.getByText('Fleet-wide custom price')).toBeTruthy();
  });
});

/**
 * Nút quay lại của thanh công cụ lịch.
 *
 * Người dùng tới màn lịch từ hộp thư yêu cầu thuê ("xe này có rảnh khung đó không?") rồi cần
 * quay về ĐÚNG chỗ vừa rời — kèm tab và trang đang lọc. `?back=` mang đường đó, và vì nó trở
 * thành `href` của một nút nên nó phải đi qua đúng bộ kiểm chống open-redirect của `?next=`.
 */
describe('CalendarToolbar - đường quay lại', () => {
  it('có `?back=` hợp lệ ⇒ hiện nút quay lại trỏ đúng chỗ vừa rời', () => {
    nav.params = new URLSearchParams(
      'q=51A-123.45&back=%2Fmanage%2Fbooking-requests%3Fstatus%3Dall%26page%3D3',
    );
    renderScheduler();
    expect(screen.getByRole('link', { name: 'Quay lại' }).getAttribute('href')).toBe(
      '/manage/booking-requests?status=all&page=3',
    );
  });

  it('không có `?back=` ⇒ KHÔNG có nút thừa', () => {
    nav.params = new URLSearchParams('q=51A-123.45');
    renderScheduler();
    expect(screen.queryByRole('link', { name: 'Quay lại' })).toBeNull();
  });

  it('`back` trỏ ra ngoài miền bị bỏ - không biến lịch thành bàn đạp phishing', () => {
    // `/\evil.example` — vài trình duyệt coi `\` như `/`, nên nó cũng là một đích ngoài miền.
    for (const hostile of ['https://evil.example', '//evil.example', '/\\evil.example']) {
      nav.params = new URLSearchParams({ back: hostile });
      const view = renderScheduler();
      expect(screen.queryByRole('link', { name: 'Quay lại' })).toBeNull();
      view.unmount();
    }
  });
});
