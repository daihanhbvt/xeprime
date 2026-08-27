import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';
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
 *  - hàng "Xe còn trống" đọc số từ backend (không tự đếm từ hàng đang render);
 *  - thiếu toàn bộ quyền thao tác thì ô không phải là nút.
 * KHÔNG khẳng định trên cấu trúc DOM tình cờ.
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
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
  }),
}));

/** Dialog con mock thành marker — test scheduler chỉ cần biết ĐÚNG dialog nào được mở. */
vi.mock('@/features/bookings/components/BookingDetailDialog', () => ({
  BookingDetailDialog: ({ bookingId, open }: { bookingId: string; open: boolean }) =>
    open ? <div data-testid="booking-detail-dialog">{bookingId}</div> : null,
}));
vi.mock('@/features/booking-requests/components/StaffBookingDialog', () => ({
  StaffBookingDialog: ({ open, vehicleId }: { open: boolean; vehicleId: string }) =>
    open ? <div data-testid="booking-form-dialog">{vehicleId}</div> : null,
}));
vi.mock('./VehicleBlockDialog', () => ({
  VehicleBlockDialog: ({ state }: { state: { vehicleId?: string } | null }) =>
    state ? <div data-testid="block-dialog">{state.vehicleId}</div> : null,
}));
vi.mock('./VehicleBlockDetailDialog', () => ({
  VehicleBlockDetailDialog: ({ blockId, open }: { blockId: string; open: boolean }) =>
    open ? <div data-testid="block-detail-dialog">{blockId}</div> : null,
}));
vi.mock('./DailyPriceDialog', () => ({
  DailyPriceDialog: ({ state }: { state: { vehicleId: string; date: string } | null }) =>
    state ? <div data-testid="price-dialog">{`${state.vehicleId}:${state.date}`}</div> : null,
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
  availableByDay: new Map<string, number>(),
  totalVehicles: 0,
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
    status: 'confirmed',
    sourceId: 'bk-1',
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
  data.resources = [resource()];
  data.eventsByResource = new Map();
  data.priceMarkers = new Map();
  data.availableByDay = new Map([
    ['2026-10-12', 3],
    ['2026-10-13', 0],
    ['2026-10-14', 5],
  ]);
  data.totalVehicles = 5;
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

describe('CalendarScheduler — lưới điều phối đội xe', () => {
  it('cột xe hiện đủ nhận diện: tên, biển số, giá ngày', () => {
    renderScheduler();
    expect(screen.getByText('Toyota Vios 2023')).toBeTruthy();
    expect(screen.getByText(/51G-123\.45/)).toBeTruthy();
    expect(screen.getByText(/750\.000/)).toBeTruthy();
  });

  it('hàng "Xe còn trống" đọc số backend cho TỪNG ngày (0 vẫn là số 0, không phải ô trống)', () => {
    renderScheduler();
    expect(screen.getByLabelText('Ngày 12: 3 xe còn trống')).toBeTruthy();
    expect(screen.getByLabelText('Ngày 13: 0 xe còn trống')).toBeTruthy();
    expect(screen.getByLabelText('Ngày 14: 5 xe còn trống')).toBeTruthy();
  });

  it('bấm ô trống mở bộ chọn hành động với ĐỦ ba lựa chọn khi đủ quyền — chưa chạy gì cả', () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Đặt xe')).toBeTruthy();
    expect(within(menu).getByText('Khóa xe')).toBeTruthy();
    expect(within(menu).getByText('Đặt giá')).toBeTruthy();
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
    expect(within(menu).queryByText('Đặt giá')).toBeNull();
  });

  it('không còn quyền thao tác nào thì ô KHÔNG phải nút — người chỉ xem không bị mời bấm', () => {
    permissions.granted = new Set([PERMISSION.CALENDAR_VIEW]);
    renderScheduler();
    expect(screen.queryByLabelText(/Tạo lịch cho Toyota Vios 2023/)).toBeNull();
  });

  it('chọn "Đặt xe" mở form tạo đơn với đúng xe được điền sẵn', () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/));
    fireEvent.click(screen.getByText('Đặt xe'));
    expect(screen.getByTestId('booking-form-dialog').textContent).toBe('veh-1');
  });

  it('chọn "Đặt giá" mở dialog giá với đúng xe + ngày', () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 14\/10/));
    fireEvent.click(screen.getByText('Đặt giá'));
    expect(screen.getByTestId('price-dialog').textContent).toBe('veh-1:2026-10-14');
  });

  it('bấm event đơn thuê mở MODAL chi tiết (không điều hướng)', () => {
    data.eventsByResource = new Map([['veh-1', [event()]]]);
    renderScheduler();
    fireEvent.click(screen.getByRole('button', { name: /Đơn thuê, DH9912/ }));
    expect(screen.getByTestId('booking-detail-dialog').textContent).toBe('bk-1');
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
          }),
          event({
            id: 'occ-m',
            type: 'maintenance',
            title: 'Bảo dưỡng',
            status: null,
            sourceId: 'mnt-7',
            startAt: '2026-10-13T01:00:00.000Z',
            endAt: '2026-10-14T01:00:00.000Z',
          }),
        ],
      ],
    ]);
    renderScheduler();

    fireEvent.click(screen.getByRole('button', { name: /Xe bị khóa/ }));
    expect(screen.getByTestId('block-detail-dialog').textContent).toBe('blk-9');

    fireEvent.click(screen.getByRole('button', { name: /Bảo dưỡng/ }));
    expect(screen.getByTestId('maintenance-dialog').textContent).toBe('mnt-7');
  });

  it('đơn chỉ vài tiếng vẫn có thanh đủ rộng để đọc/bấm — sàn bề rộng, không phải vệt vài px', () => {
    data.eventsByResource = new Map([
      [
        'veh-1',
        [
          event({
            startAt: '2026-10-12T01:00:00.000Z',
            endAt: '2026-10-12T03:00:00.000Z', // 2 tiếng ≈ 5px trên cột 64px nếu vẽ theo tỉ lệ thật
          }),
        ],
      ],
    ]);
    renderScheduler();
    const bar = screen.getByRole('button', { name: /Đơn thuê, DH9912/ });
    expect(parseFloat(bar.style.getPropertyValue('--xp-bar-width'))).toBeGreaterThanOrEqual(46);
  });

  it('event dưới 24h vẽ theo THANG 12H (nhân đôi, cặp 1 ngày) — 11 tiếng chiếm gần trọn ô', () => {
    data.eventsByResource = new Map([
      [
        'veh-1',
        [
          event({
            startAt: '2026-10-12T01:00:00.000Z',
            endAt: '2026-10-12T12:00:00.000Z', // 11h: tỉ lệ 24h ≈ 27px, thang 12h ≈ 57px trên cột 64px
          }),
        ],
      ],
    ]);
    renderScheduler();
    const bar = screen.getByRole('button', { name: /Đơn thuê, DH9912/ });
    expect(parseFloat(bar.style.getPropertyValue('--xp-bar-width'))).toBeGreaterThanOrEqual(54);
  });

  it('thu gọn cột phương tiện: chỉ còn ảnh, mở lại là đủ chữ', () => {
    renderScheduler();
    expect(screen.getByText('Toyota Vios 2023')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn cột phương tiện' }));
    expect(screen.queryByText('Toyota Vios 2023')).toBeNull();
    // Ô xe vẫn nhận diện được qua nút thông tin (ảnh + popover).
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
      // AntD ẩn popover đã đóng bằng container hidden — nội dung không còn hiển thị.
      expect(card === null || card.closest('.ant-popover-hidden') != null).toBe(true);
    });
  });

  it('khoảng không có lịch: lưới VẪN hiện kèm một dòng gợi ý, không phải màn rỗng chặn', () => {
    renderScheduler();
    expect(screen.getByRole('status').textContent).toContain('Chưa có lịch trong khoảng này');
    // Ô vẫn bấm được ngay bên dưới thông báo.
    expect(screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10/)).toBeTruthy();
  });

  it('ô có giá riêng nói ra trong nhãn trợ năng — không chỉ là một chấm màu', () => {
    data.priceMarkers = new Map([
      ['veh-1:2026-10-12', { dailyPrice: '1200000', hourlyPrice: null }],
    ]);
    renderScheduler();
    expect(
      screen.getByLabelText(/Tạo lịch cho Toyota Vios 2023 ngày 12\/10 · đang có giá riêng/),
    ).toBeTruthy();
  });

  it('thiếu calendar.view thì chặn từ ngoài cửa', () => {
    permissions.granted = new Set();
    renderScheduler();
    expect(screen.getByText('Không có quyền xem lịch xe')).toBeTruthy();
  });
});

/**
 * Lớp ngày lễ — một lớp THÔNG TIN chồng lên lưới.
 *
 * Hai điều được khoá, và điều thứ hai quan trọng hơn điều thứ nhất:
 *  - ngày lễ phải nhận ra được bằng thứ KHÁC màu nền (nhãn trợ năng + cờ), vì nền cột cố ý rất nhạt;
 *  - ngày lễ KHÔNG được chặn bất cứ thao tác nào — ô vẫn mở bộ chọn hành động như mọi ngày khác.
 */
describe('CalendarScheduler — lớp ngày lễ', () => {
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

  it('không có ngày lễ thì header KHÔNG mọc thêm nút nào', () => {
    renderScheduler();

    expect(screen.queryByLabelText(/^Ngày lễ:/)).toBeNull();
  });

  it('thẻ ngày lễ chỉ còn TÊN và LOẠI — ngày/nguồn/thời điểm đồng bộ đã bỏ theo thiết kế mới', async () => {
    holidays.byDay = new Map([['2026-10-13', QUOC_KHANH]]);
    renderScheduler();

    fireEvent.click(screen.getByLabelText(/^Ngày lễ: Ngày lễ thử/));

    expect(await screen.findByText('Ngày lễ thử')).toBeTruthy();
    expect(screen.getByText('Nghỉ lễ chính thức')).toBeTruthy();
    // Ba dòng của bản cũ đã đi hẳn: chúng đẩy hai hành động thật xuống dưới nếp gấp.
    expect(screen.queryByText('13/10/2026')).toBeNull();
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

  it('ô của cột ngày lễ mang thêm ngữ cảnh trong nhãn, giữ nguyên phần cũ', () => {
    holidays.byDay = new Map([['2026-10-13', QUOC_KHANH]]);
    renderScheduler();

    expect(
      screen.getByLabelText('Tạo lịch cho Toyota Vios 2023 ngày 13/10 · ngày lễ: Ngày lễ thử'),
    ).toBeTruthy();
  });

  it('chú giải có mục Ngày lễ', () => {
    renderScheduler();

    const legend = screen.getByLabelText('Chú giải lịch');
    expect(within(legend).getByText('Ngày lễ')).toBeTruthy();
  });
});

/**
 * Bản TIẾNG ANH của chính màn này.
 *
 * Vì sao đáng một khối test riêng: mọi test phía trên chạy ở tiếng Việt, và tiếng Việt là
 * ngôn ngữ mà chuỗi được CHÉP NGUYÊN VĂN từ mã sang bó message — nên chúng vẫn xanh kể cả khi
 * bản `en` thiếu khoá, sai biến ICU, hoặc chưa được dịch. Cái duy nhất chứng minh màn hình
 * dùng được ở tiếng Anh là dựng nó bằng tiếng Anh và đọc kết quả.
 */
/**
 * Bảng hành động của một ngày — thay cho thẻ ngày lễ chỉ-đọc trước đây.
 *
 * Khoá bốn hợp đồng, và cả bốn đều là yêu cầu tường minh của người dùng:
 *  - mở bằng CLICK, không phải hover (bảng có hành động thật, hover thì không thao tác được);
 *  - chỉ hiện TÊN + LOẠI lễ, không còn mô tả/nguồn/thời điểm đồng bộ;
 *  - không còn nút "Xem chi tiết";
 *  - hai hành động đi theo QUYỀN, và ngày thường cũng bấm được (khoá/đặt giá là việc quanh năm).
 */
describe('CalendarScheduler — bảng hành động của một ngày', () => {
  const HOLIDAY = {
    id: 'hol-1',
    startDate: '2026-10-13',
    endDate: '2026-10-13',
    name: 'Ngày lễ thử',
    description: 'Ngày lễ',
    eventType: 'public_holiday',
    source: 'google_calendar',
    syncedAt: '2026-10-12T01:00:00.000Z',
  };

  it('bấm header ngày lễ mở bảng — HOVER thì không', async () => {
    holidays.byDay = new Map([['2026-10-13', HOLIDAY]]);
    renderScheduler();

    const trigger = screen.getByLabelText(/^Ngày lễ: Ngày lễ thử/);
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByText('Khóa xe nhanh')).toBeNull();

    fireEvent.click(trigger);
    expect(await screen.findByText('Khóa xe nhanh')).toBeTruthy();
  });

  it('chỉ hiện TÊN và LOẠI lễ — không mô tả, nguồn, thời điểm đồng bộ, không nút Xem chi tiết', async () => {
    holidays.byDay = new Map([['2026-10-13', HOLIDAY]]);
    renderScheduler();
    fireEvent.click(screen.getByLabelText(/^Ngày lễ: Ngày lễ thử/));

    expect(await screen.findByText('Ngày lễ thử')).toBeTruthy();
    expect(screen.getByText('Nghỉ lễ chính thức')).toBeTruthy();

    expect(screen.queryByText('Nguồn')).toBeNull();
    expect(screen.queryByText('Cập nhật')).toBeNull();
    expect(screen.queryByText('Xem chi tiết')).toBeNull();
  });

  it('NGÀY THƯỜNG cũng mở được bảng — khoá xe và đặt giá là việc quanh năm', async () => {
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

  it('gạt công tắc KHOÁ NGAY — không bắt đi qua modal', async () => {
    renderScheduler();
    fireEvent.click(screen.getByLabelText('Thao tác cho ngày 12/10/2026'));

    fireEvent.click(await screen.findByRole('switch', { name: 'Khóa xe nhanh' }));

    // Khoá thẳng: gửi đúng ngày đó và đúng những xe đang rảnh.
    expect(bulk.block).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-10-12',
        to: '2026-10-12',
        vehicleIds: ['veh-1', 'veh-2'],
      }),
      expect.anything(),
    );
    // KHÔNG mở modal — đó là đường của mũi tên, không phải của công tắc.
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

describe('CalendarScheduler — bản tiếng Anh', () => {
  function renderEnglish() {
    return renderWithIntl(
      <App>
        <CalendarScheduler />
      </App>,
      { locale: 'en' },
    );
  }

  it('chữ của lưới và chú giải ra tiếng Anh, không rơi về khoá message', () => {
    renderEnglish();

    expect(screen.getByLabelText('Vehicle rental calendar by day')).toBeTruthy();
    const legend = screen.getByLabelText('Calendar legend');
    expect(within(legend).getByText('Booking')).toBeTruthy();
    expect(within(legend).getByText('Holiday')).toBeTruthy();

    // Khoá chưa dịch sẽ hiện nguyên dạng `Calendar.legend.booking` — chặn đúng lỗi đó.
    expect(document.body.textContent).not.toMatch(/Calendar\.[a-z]/i);
  });

  it('số nhiều ICU đúng ở tiếng Anh: 1 xe khác 3 xe', () => {
    data.availableByDay = new Map([
      ['2026-10-12', 1],
      ['2026-10-13', 3],
    ]);
    renderEnglish();

    expect(screen.getByLabelText('Day 12: 1 vehicle available')).toBeTruthy();
    expect(screen.getByLabelText('Day 13: 3 vehicles available')).toBeTruthy();
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

    fireEvent.click(screen.getByLabelText(/^Holiday: Test holiday, on 13\/10\/2026/));

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
describe('CalendarToolbar — đường quay lại', () => {
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

  it('`back` trỏ ra ngoài miền bị bỏ — không biến lịch thành bàn đạp phishing', () => {
    // `/\evil.example` — vài trình duyệt coi `\` như `/`, nên nó cũng là một đích ngoài miền.
    for (const hostile of ['https://evil.example', '//evil.example', '/\\evil.example']) {
      nav.params = new URLSearchParams({ back: hostile });
      const view = renderScheduler();
      expect(screen.queryByRole('link', { name: 'Quay lại' })).toBeNull();
      view.unmount();
    }
  });
});
