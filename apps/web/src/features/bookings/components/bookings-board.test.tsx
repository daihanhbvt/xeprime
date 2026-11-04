import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  BOOKING_LIST_PRESET,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  PERMISSION,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  type BookingListPreset,
} from '@xeprime/types';
import { bookingPath } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';
import type { BookingFilters, BookingListItem } from '../types';

/**
 * Màn "Quản lý đơn thuê xe" (Figma Partner-XePrime All Request, 02/11/2026).
 *
 * Khoá những điều một bản "làm cho giống ảnh" sẽ trượt:
 *  1. Ngăn đi xuống SERVER (`preset`) — không lọc lại trên trang đã phân trang; ô "Tất cả" là bốn
 *     truy vấn CÓ GIỚI HẠN, chỉ truy vấn đang xem được bật.
 *  2. Số đếm cột trái đọc từ `meta.presetCounts` của server; "Tất cả" là tổng bốn ngăn.
 *  3. Nút bàn giao trỏ trang chi tiết với hộp thoại đúng CHẶNG mở sẵn — không có luồng thứ hai —
 *     và chỉ hiện với người được xác nhận bàn giao.
 *  4. Câu tình trạng mỗi ngăn nói đúng điều của ngăn đó (quá giờ giao, tiến độ, đúng hạn, ai huỷ).
 */

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock(
  '@/features/branches/hooks/use-branch-filter',
  () => import('@/features/branches/test-utils'),
);
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/bookings',
  useSearchParams: () => new URLSearchParams(),
}));

const filters = vi.hoisted(() => ({ value: {} as BookingFilters, setFilters: vi.fn() }));
vi.mock('../hooks/use-booking-filters', () => ({
  useBookingFilters: () => ({ filters: filters.value, setFilters: filters.setFilters }),
}));

vi.mock('@/features/booking-requests/hooks/use-booking-request-mutations', () => ({
  useStartBookingRequestConversation: () => ({
    mutate: vi.fn(),
    isPending: false,
    variables: null,
  }),
}));

const COUNTS = [
  { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP, count: 4 },
  { preset: BOOKING_LIST_PRESET.RENTING, count: 2 },
  { preset: BOOKING_LIST_PRESET.COMPLETED, count: 20 },
  { preset: BOOKING_LIST_PRESET.CANCELLED, count: 1 },
];

/** Bắt ĐÚNG đối số trang gửi xuống tầng gọi API, và trả dữ liệu theo ngăn. */
const queried = vi.hoisted(() => ({
  calls: [] as Array<{ filters: BookingFilters; enabled: boolean }>,
  byPreset: {} as Record<string, { items: unknown[]; total: number }>,
}));
vi.mock('../hooks/use-bookings', () => ({
  useBookings: (f: BookingFilters, options: { enabled?: boolean } = {}) => {
    const enabled = options.enabled ?? true;
    queried.calls.push({ filters: f, enabled });
    const entry = queried.byPreset[f.preset ?? 'none'] ?? { items: [], total: 0 };
    return enabled
      ? {
          data: {
            items: entry.items,
            meta: { page: 1, limit: 20, total: entry.total, hasNext: false, presetCounts: COUNTS },
          },
          isError: false,
          isFetching: false,
          refetch: vi.fn(),
        }
      : { data: undefined, isError: false, isFetching: false, refetch: vi.fn() };
  },
}));

// Dòng thông số đọc nhãn nhiên liệu từ danh mục API — test dùng bản cố định.
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);

vi.mock('@/features/booking-requests/components/StaffBookingDialog', () => ({
  StaffBookingDialog: () => null,
}));

const { BookingsListView } = await import('./BookingsListView');

const HOUR = 3_600_000;

function row(over: Partial<BookingListItem> & { id: string }): BookingListItem {
  return {
    code: `XP-${over.id}`,
    vehicleId: 'V1',
    vehicleName: 'Hyundai Grand i10',
    vehiclePlate: '43A-276.16',
    vehicleType: VEHICLE_TYPE.CAR,
    seatCount: 4,
    customerName: `Khách ${over.id}`,
    customerPhone: '0900000000',
    status: BOOKING_STATUS.RESERVED,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    longTermPackageMonths: null,
    pickupAt: new Date(Date.now() + 26 * HOUR).toISOString(),
    returnAt: new Date(Date.now() + 72 * HOUR).toISOString(),
    canMessageOnPlatform: false,
    bookingRequestId: null,
    driver: null,
    createdAt: new Date().toISOString(),
    ...over,
  } as BookingListItem;
}

function seed(preset: BookingListPreset, items: BookingListItem[], total = items.length) {
  queried.byPreset[preset] = { items, total };
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_CREATE]);
  me.billingMode = BILLING_MODE.PACKAGE;
  filters.value = {};
  filters.setFilters.mockClear();
  queried.calls = [];
  queried.byPreset = {};
});

const enabledCalls = () => queried.calls.filter((call) => call.enabled).map((call) => call.filters);

describe('Ô "Tất cả" — bốn truy vấn có giới hạn, chỉ cái đang xem được bật', () => {
  it('mỗi ngăn một truy vấn 3 chuyến; truy vấn một-ngăn tắt', () => {
    renderWithIntl(<BookingsListView />);
    const presets = enabledCalls().map((f) => f.preset);
    expect(new Set(presets)).toEqual(
      new Set([
        BOOKING_LIST_PRESET.AWAITING_PICKUP,
        BOOKING_LIST_PRESET.RENTING,
        BOOKING_LIST_PRESET.COMPLETED,
        BOOKING_LIST_PRESET.CANCELLED,
      ]),
    );
    expect(enabledCalls().every((f) => f.limit === 3 && f.page === 1)).toBe(true);
    // Không còn ô lọc trạng thái — cột trái là bộ lọc trạng thái.
    expect(enabledCalls().every((f) => f.status === undefined)).toBe(true);
  });

  it('nhóm có nhiều hơn số đang hiện thì có đường "Xem tất cả (n)" sang ngăn đó', () => {
    seed(BOOKING_LIST_PRESET.COMPLETED, [row({ id: 'C1', status: BOOKING_STATUS.COMPLETED })], 20);
    renderWithIntl(<BookingsListView />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả (20)' }));
    expect(filters.setFilters).toHaveBeenCalledWith({
      preset: BOOKING_LIST_PRESET.COMPLETED,
      sort: undefined,
      page: undefined,
    });
  });

  it('không có đơn nào thì mời tạo đơn đầu tiên', () => {
    renderWithIntl(<BookingsListView />);
    expect(screen.getByText('Gian hàng chưa có đơn thuê nào')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tạo đơn đầu tiên/ })).toBeTruthy();
  });

  it('gian hàng tuyến HOA HỒNG không có lối lập đơn tay', () => {
    me.billingMode = BILLING_MODE.COMMISSION;
    renderWithIntl(<BookingsListView />);
    expect(screen.queryByRole('button', { name: /Tạo đơn thuê/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tạo đơn đầu tiên/ })).toBeNull();
  });
});

describe('Cột trái', () => {
  it('số đếm từ server; "Tất cả" là tổng bốn ngăn', () => {
    renderWithIntl(<BookingsListView />);
    const rail = screen.getByRole('navigation', { name: 'Lọc đơn thuê theo trạng thái' });
    expect(within(rail).getByRole('button', { name: /Tất cả\s*27/ })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: /Chờ giao xe\s*4/ })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: /Đã hủy\s*1/ })).toBeTruthy();
  });

  it('chọn một ngăn ghi `preset` lên URL và bỏ trang/sắp xếp của ngăn cũ', () => {
    renderWithIntl(<BookingsListView />);
    fireEvent.click(screen.getByRole('button', { name: /Đang thuê/ }));
    expect(filters.setFilters).toHaveBeenCalledWith({
      preset: BOOKING_LIST_PRESET.RENTING,
      sort: undefined,
      page: undefined,
    });
  });
});

describe('Một ngăn — danh sách đầy đủ', () => {
  it('gửi đúng `preset`, mặc định sắp xếp của ngăn hiện trên ô "Sắp xếp"', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP };
    renderWithIntl(<BookingsListView />);
    const [call] = enabledCalls();
    expect(enabledCalls()).toHaveLength(1);
    expect(call!.preset).toBe(BOOKING_LIST_PRESET.AWAITING_PICKUP);
    // Không ép sort lên API — server tự dùng thứ tự tự nhiên của ngăn.
    expect(call!.sort).toBeUndefined();
    expect(screen.getByText('Nhận xe sớm nhất')).toBeTruthy();
  });

  it('cách người dùng chọn sắp xếp thắng mặc định', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP, sort: 'return_asc' };
    renderWithIntl(<BookingsListView />);
    expect(enabledCalls()[0]!.sort).toBe('return_asc');
  });

  it('rỗng thì nói ngăn này chưa có đơn', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.RENTING };
    renderWithIntl(<BookingsListView />);
    expect(screen.getByText('Chưa có đơn nào ở mục này')).toBeTruthy();
  });
});

describe('Thẻ đơn — hành động bàn giao', () => {
  it('Chờ giao xe: "Xử lý giao xe" mở trang chi tiết (không mở sẵn hộp xác nhận)', () => {
    permissions.granted.add(PERMISSION.HANDOVER_CONFIRM);
    filters.value = { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP };
    seed(BOOKING_LIST_PRESET.AWAITING_PICKUP, [row({ id: 'A1' })]);
    renderWithIntl(<BookingsListView />);
    expect(screen.getByRole('link', { name: /Xử lý giao xe/ }).getAttribute('href')).toBe(
      bookingPath.detail('A1'),
    );
  });

  it('Đang thuê: "Nhận xe" mở trang chi tiết; vẫn có "Xem chi tiết"', () => {
    permissions.granted.add(PERMISSION.HANDOVER_CONFIRM);
    filters.value = { preset: BOOKING_LIST_PRESET.RENTING };
    seed(BOOKING_LIST_PRESET.RENTING, [row({ id: 'R1', status: BOOKING_STATUS.ACTIVE })]);
    renderWithIntl(<BookingsListView />);
    expect(screen.getByRole('link', { name: /Nhận xe/ }).getAttribute('href')).toBe(
      bookingPath.detail('R1'),
    );
    expect(screen.getByRole('link', { name: 'Xem chi tiết' }).getAttribute('href')).toBe(
      bookingPath.detail('R1'),
    );
  });

  it('không được xác nhận bàn giao thì chỉ còn "Xem chi tiết"', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP };
    seed(BOOKING_LIST_PRESET.AWAITING_PICKUP, [row({ id: 'A1' })]);
    renderWithIntl(<BookingsListView />);
    expect(screen.queryByRole('link', { name: /Xử lý giao xe/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toBeTruthy();
  });
});

describe('Thẻ đơn — gia hạn đơn dài hạn (ADR 0077)', () => {
  it('chỉ thẻ DÀI HẠN đang thuê có "Gia hạn", và chỉ khi được sửa đơn; vẫn giữ "Nhận xe"', () => {
    permissions.granted.add(PERMISSION.HANDOVER_CONFIRM);
    permissions.granted.add(PERMISSION.BOOKING_UPDATE);
    filters.value = { preset: BOOKING_LIST_PRESET.RENTING };
    seed(BOOKING_LIST_PRESET.RENTING, [
      row({
        id: 'L1',
        status: BOOKING_STATUS.ACTIVE,
        serviceType: SERVICE_TYPE.LONG_TERM,
        bookingRequestId: 'REQ1',
      }),
      // Dài hạn nhưng gian hàng tự lập ngoài chợ — không có tài khoản khách để nhận QR.
      row({ id: 'L2', status: BOOKING_STATUS.ACTIVE, serviceType: SERVICE_TYPE.LONG_TERM }),
      row({ id: 'S1', status: BOOKING_STATUS.ACTIVE, bookingRequestId: 'REQ2' }),
    ]);
    renderWithIntl(<BookingsListView />);
    expect(screen.getAllByRole('button', { name: /Gia hạn/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Nhận xe/ })).toHaveLength(3);
  });

  it('không có quyền sửa đơn thì không có nút "Gia hạn"', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.RENTING };
    seed(BOOKING_LIST_PRESET.RENTING, [
      row({
        id: 'L1',
        status: BOOKING_STATUS.ACTIVE,
        serviceType: SERVICE_TYPE.LONG_TERM,
        bookingRequestId: 'REQ1',
      }),
    ]);
    renderWithIntl(<BookingsListView />);
    expect(screen.queryByRole('button', { name: /Gia hạn/ })).toBeNull();
  });
});

describe('Thẻ đơn — câu tình trạng của từng ngăn', () => {
  it('đơn quá giờ hẹn giao thì nói quá giờ', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP };
    seed(BOOKING_LIST_PRESET.AWAITING_PICKUP, [
      row({ id: 'A1', pickupAt: new Date(Date.now() - 2 * HOUR).toISOString() }),
    ]);
    renderWithIntl(<BookingsListView />);
    expect(screen.getByText(/Quá giờ giao xe/)).toBeTruthy();
  });

  it('đang thuê thì nói đã đi bao nhiêu và còn bao lâu', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.RENTING };
    seed(BOOKING_LIST_PRESET.RENTING, [
      row({
        id: 'R1',
        status: BOOKING_STATUS.ACTIVE,
        pickupAt: new Date(Date.now() - 6 * HOUR).toISOString(),
        actualPickupAt: new Date(Date.now() - 6 * HOUR).toISOString(),
        returnAt: new Date(Date.now() + 4 * HOUR + 60_000).toISOString(),
      }),
    ]);
    renderWithIntl(<BookingsListView />);
    expect(screen.getByText('Đã đi 59% · còn 4 giờ')).toBeTruthy();
  });

  it('hoàn thành: trả trễ thì nói trễ', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.COMPLETED };
    const returnAt = new Date(Date.now() - 10 * HOUR).toISOString();
    seed(BOOKING_LIST_PRESET.COMPLETED, [
      row({
        id: 'C1',
        status: BOOKING_STATUS.COMPLETED,
        returnAt,
        actualReturnAt: new Date(Date.now() - 9 * HOUR).toISOString(),
      }),
    ]);
    renderWithIntl(<BookingsListView />);
    expect(screen.getByText('Trả xe trễ hạn')).toBeTruthy();
  });

  it('đã huỷ: nói ai huỷ; không đến thì nói khách không đến', () => {
    filters.value = { preset: BOOKING_LIST_PRESET.CANCELLED };
    seed(BOOKING_LIST_PRESET.CANCELLED, [
      row({
        id: 'X1',
        status: BOOKING_STATUS.CANCELLED,
        cancellationParty: CANCELLATION_PARTY.CUSTOMER,
      }),
      row({ id: 'X2', status: BOOKING_STATUS.NO_SHOW }),
    ]);
    renderWithIntl(<BookingsListView />);
    expect(screen.getByText('Khách đã hủy')).toBeTruthy();
    expect(screen.getByText('Khách không đến')).toBeTruthy();
  });
});
