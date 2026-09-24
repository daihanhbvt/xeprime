import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_LIST_PRESET,
  BOOKING_STATUS,
  HANDOVER_STATUS,
  PERMISSION,
  SERVICE_TYPE,
} from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { BookingFilters, BookingListItem } from '../types';

/**
 * Màn "Chờ giao xe" — một LỐI TẮT tới danh sách đơn, không phải một màn hình thứ hai.
 *
 * Bốn điều được khoá ở đây, và cả bốn đều là những chỗ một bản "làm cho xong" sẽ trượt:
 *
 *  1. Nhóm việc được gửi LÊN SERVER (`preset`), không phải lọc lại trên trang đã phân trang.
 *     Lọc ở client nghĩa là trang 2 thiếu đơn và con số tổng nói dối.
 *  2. Đơn QUÁ GIỜ hiện rõ là quá giờ — nó là việc cần xử lý trước hết, không phải thứ biến mất.
 *  3. Trạng thái rỗng dẫn sang "Tất cả đơn thuê" và KHÔNG mời tạo đơn: hàng đợi rỗng nghĩa là
 *     hết việc, không phải nghĩa là gian hàng chưa có đơn nào.
 *  4. Nơi giao xe đọc từ MÃ server trả, dịch ở client — không phải một câu tiếng Việt ghép sẵn
 *     ở backend (ADR 0012).
 */

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  usePathname: () => '/manage/bookings/awaiting-pickup',
  useSearchParams: () => new URLSearchParams(),
}));

const filters = vi.hoisted(() => ({ value: {} as BookingFilters, setFilters: vi.fn() }));
vi.mock('../hooks/use-booking-filters', () => ({
  useBookingFilters: () => ({ filters: filters.value, setFilters: filters.setFilters }),
}));

/** Bắt lại ĐÚNG đối số mà trang gửi xuống tầng gọi API. */
const queried = vi.hoisted(() => ({ calls: [] as BookingFilters[], items: [] as unknown[] }));
vi.mock('../hooks/use-bookings', () => ({
  useBookings: (f: BookingFilters) => {
    queried.calls.push(f);
    return {
      data: {
        items: queried.items,
        meta: { page: 1, limit: 20, total: queried.items.length, hasNext: false },
      },
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
}));

vi.mock('@/features/booking-requests/components/StaffBookingDialog', () => ({
  StaffBookingDialog: () => null,
}));

// Nhập SAU khi mock — `BookingsListView` đọc các hook trên ngay lúc module được nạp.
const { BookingsListView } = await import('./BookingsListView');

const HOUR = 3_600_000;

function row(over: Partial<BookingListItem> & { id: string }): BookingListItem {
  return {
    code: `XP-${over.id}`,
    vehicleId: 'V1',
    vehicleName: 'Hyundai Grand i10',
    vehiclePlate: '43A-276.16',
    customerName: `Khách ${over.id}`,
    customerPhone: '0900000000',
    status: BOOKING_STATUS.RESERVED,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    longTermPackageMonths: null,
    pickupAt: new Date(Date.now() + 26 * HOUR).toISOString(),
    returnAt: new Date(Date.now() + 72 * HOUR).toISOString(),
    totalAmount: '500000',
    paidAmount: '0',
    surchargeTotal: '0',
    amountDue: '500000',
    otherCollected: '0',
    collectedAmount: '0',
    debtAmount: '500000',
    depositAmount: '0',
    driver: null,
    createdAt: new Date().toISOString(),
    pickupHandoverStatus: null,
    handoverPlaceKind: 'branch',
    handoverPlace: 'Chi nhánh Quận 1',
    ...over,
  } as BookingListItem;
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_CREATE]);
  filters.value = {};
  filters.setFilters.mockClear();
  routerPush.mockClear();
  queried.calls = [];
  queried.items = [];
});

describe('Chờ giao xe — nhóm việc đi xuống server', () => {
  it('gửi `preset` và mặc định sắp xếp theo giờ hẹn', () => {
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);

    const last = queried.calls.at(-1)!;
    expect(last.preset).toBe(BOOKING_LIST_PRESET.AWAITING_PICKUP);
    expect(last.sort).toBe('pickup_asc');
  });

  it('danh sách đầy đủ KHÔNG gửi `preset`, và giữ mặc định "mới nhất"', () => {
    renderWithIntl(<BookingsListView />);

    const last = queried.calls.at(-1)!;
    expect(last.preset).toBeUndefined();
    expect(last.sort).toBe('newest');
  });

  it('cách khách chọn sắp xếp vẫn thắng mặc định của nhóm việc', () => {
    filters.value = { sort: 'return_asc' };
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);

    expect(queried.calls.at(-1)!.sort).toBe('return_asc');
  });
});

describe('Chờ giao xe — những gì người trực nhìn thấy', () => {
  it('đơn quá giờ mang nhãn quá giờ, đơn ngày mai thì không', () => {
    queried.items = [
      row({ id: 'A', pickupAt: new Date(Date.now() - 3 * HOUR).toISOString() }),
      row({ id: 'B', pickupAt: new Date(Date.now() + 26 * HOUR).toISOString() }),
    ];
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);

    const overdue = screen.getByText('Khách A').closest('tr')!;
    const upcoming = screen.getByText('Khách B').closest('tr')!;
    expect(within(overdue).getByText('Quá giờ giao xe')).toBeTruthy();
    expect(within(upcoming).getByText('Sắp tới')).toBeTruthy();
    // Quá giờ KHÔNG được trình bày như "khách không đến" — đó là một quyết định của con người.
    expect(within(overdue).queryByText('Khách không đến')).toBeNull();
  });

  it('nơi giao xe = nhãn dịch từ MÃ + chuỗi thô của server', () => {
    queried.items = [
      row({ id: 'A', handoverPlaceKind: 'delivery', handoverPlace: '12 Nguyễn Huệ, Quận 1' }),
    ];
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);

    expect(screen.getByText('Giao tận nơi')).toBeTruthy();
    expect(screen.getByText('12 Nguyễn Huệ, Quận 1')).toBeTruthy();
  });

  it('chưa có biên bản thì nói rõ là chưa chuẩn bị, có rồi thì hiện đúng bước', () => {
    queried.items = [
      row({ id: 'A' }),
      row({ id: 'B', pickupHandoverStatus: HANDOVER_STATUS.READY }),
    ];
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);

    expect(
      within(screen.getByText('Khách A').closest('tr')!).getByText('Chưa chuẩn bị'),
    ).toBeTruthy();
    expect(
      within(screen.getByText('Khách B').closest('tr')!).getByText('Sẵn sàng xác nhận'),
    ).toBeTruthy();
  });

  /*
   * ADR 0047: màn này đã LÀ một preset lọc sẵn — ô lọc trạng thái + cột trạng thái đơn không
   * còn field/column nào để vẽ (server chỉ còn đúng một giá trị khả dĩ, `reserved`).
   */
  it('KHÔNG còn ô lọc trạng thái', () => {
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);
    expect(screen.queryByLabelText('Trạng thái')).toBeNull();
  });

  it('KHÔNG còn cột trạng thái đơn', () => {
    queried.items = [row({ id: 'A' })];
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);
    // Không còn tiêu đề cột "Trạng thái" (khác tiêu đề trang "Chờ giao xe" ở thẻ <h1>).
    expect(screen.queryByRole('columnheader', { name: 'Trạng thái' })).toBeNull();
  });

  it('nút hành động là "Xử lý giao xe", không phải "Giao xe" — nó chỉ mở trang chi tiết', () => {
    queried.items = [row({ id: 'A' })];
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);
    expect(screen.getByRole('button', { name: 'Xử lý giao xe' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Giao xe' })).toBeNull();
  });
});

describe('Chờ giao xe — trạng thái rỗng', () => {
  it('rỗng thì dẫn sang "Tất cả đơn thuê", KHÔNG mời tạo đơn đầu tiên', () => {
    renderWithIntl(<BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />);

    expect(screen.getByText('Chưa có đơn nào chờ giao xe')).toBeTruthy();
    expect(screen.getByText('Xem tất cả đơn thuê')).toBeTruthy();
    expect(screen.queryByText('Tạo đơn đầu tiên')).toBeNull();
    // Hàng đợi việc đang chạy không phải chỗ mở một chuyến mới.
    expect(screen.queryByRole('button', { name: 'Tạo đơn' })).toBeNull();
  });

  it('danh sách đầy đủ vẫn giữ nguyên lối tạo đơn', () => {
    renderWithIntl(<BookingsListView />);

    expect(screen.getByText('Tạo đơn đầu tiên')).toBeTruthy();
    expect(screen.queryByText('Xem tất cả đơn thuê')).toBeNull();
  });
});
