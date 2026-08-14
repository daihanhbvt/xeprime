import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';

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
vi.mock('./BookingDetailDialog', () => ({
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
