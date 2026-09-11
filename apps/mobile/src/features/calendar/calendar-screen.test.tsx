import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  BOOKING_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  PERMISSION,
  VEHICLE_BLOCK_REASON,
  VEHICLE_OPERATION_STATUS,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { branchesApi } from '@/features/branches/api';
import { branchScopeReset, branchSelected } from '@/features/branches/branch-scope.slice';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { CalendarScreen } from './CalendarScreen';
import { calendarApi, type CalendarEvent, type CalendarResource } from './api';

/* Tên phải bắt đầu bằng `mock` — jest chỉ cho factory của `jest.mock` đọc biến ngoài phạm vi khi nó mang tiền tố đó. */
const mockPush = jest.fn();
let mockRouteParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/manage/calendar',
  useLocalSearchParams: () => mockRouteParams,
  /* Màn dùng nó để QUÊN chữ ký route lúc rời đi — ở test thì cứ chạy như một effect thường. */
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(effect, [effect]);
  },
}));

/*
 * Thanh trên đọc phiên qua `useAuthenticatedUser()` và NÉM khi chưa có — nó vốn chỉ sống sau
 * `RequireSession`. Màn lịch là thứ đang test, không phải cái vỏ; mock như mọi test màn quản lý.
 */
jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

const TENANT_ID = '01JQZX0000000000000000000T';
const VEHICLE_ID = '01JQZX0000000000000000000V';
const BRANCH_ID = '01JQZX0000000000000000000B';
const BLOCK_ID = '01JQZX0000000000000000000K';
const BOOKING_ID = '01JQZX0000000000000000000O';

/** Mốc cố định: lịch mặc định mở ở "hôm nay", nên hôm nay phải là một giá trị kiểm được. */
const NOW = new Date('2026-07-12T03:00:00.000Z');
/** 00:00 giờ VN ngày 12/07/2026 — đầu khoảng mặc định. */
const RANGE_START = '2026-07-11T17:00:00.000Z';

function currentUser(permissions: Permission[]): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: TENANT_ID,
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_owner',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  };
}

const ALL_PERMISSIONS: Permission[] = [
  PERMISSION.CALENDAR_VIEW,
  PERMISSION.BOOKING_CREATE,
  PERMISSION.BOOKING_VIEW,
  PERMISSION.VEHICLE_BLOCK_SCHEDULE,
  PERMISSION.VEHICLE_UPDATE,
  PERMISSION.VEHICLE_VIEW,
  PERMISSION.BRANCH_VIEW,
];

function resource(overrides: Partial<CalendarResource> = {}): CalendarResource {
  return {
    id: VEHICLE_ID,
    vehicleId: VEHICLE_ID,
    name: 'Toyota Vios',
    code: 'XE001',
    plateNumber: '43A-123.45',
    mainImageUrl: null,
    weekdayPrice: '800000',
    hourlyPrice: null,
    vehicleType: 'car',
    operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
    ...overrides,
  };
}

function bookingEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev-booking',
    resourceId: VEHICLE_ID,
    type: OCCUPANCY_SOURCE_TYPE.BOOKING,
    title: 'DH1234 · Nguyễn Văn A',
    customerName: 'Nguyễn Văn A',
    startAt: '2026-07-12T01:00:00.000Z',
    endAt: '2026-07-13T01:00:00.000Z',
    status: BOOKING_STATUS.ACTIVE,
    sourceId: BOOKING_ID,
    ...overrides,
  };
}

function blockEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return bookingEvent({
    id: 'ev-block',
    type: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
    title: 'Bảo dưỡng ngoài kế hoạch',
    customerName: null,
    status: VEHICLE_BLOCK_REASON.UNPLANNED_MAINTENANCE,
    sourceId: BLOCK_ID,
    ...overrides,
  });
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrap(children: ReactNode, client: QueryClient) {
  return withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ReduxProvider>,
  );
}

/** Bốn query của lưới + ngày lễ. Trả về các spy để từng test khẳng định tham số đã gửi. */
function mockCalendar(options: { resources?: CalendarResource[]; events?: CalendarEvent[] } = {}) {
  const resources = jest
    .spyOn(calendarApi, 'resources')
    .mockResolvedValue(options.resources ?? [resource()]);
  const events = jest.spyOn(calendarApi, 'events').mockResolvedValue(options.events ?? []);
  const availability = jest
    .spyOn(calendarApi, 'availability')
    .mockResolvedValue({ days: [{ date: '2026-07-12', availableCount: 1 }], totalVehicles: 1 });
  const dailyPrices = jest.spyOn(calendarApi, 'dailyPrices').mockResolvedValue([]);
  const holidays = jest.spyOn(calendarApi, 'holidays').mockResolvedValue({ items: [] });
  return { resources, events, availability, dailyPrices, holidays };
}

async function renderScreen(permissions: Permission[] = ALL_PERMISSIONS) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser(permissions));
  return render(wrap(<CalendarScreen />, makeClient()));
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

/**
 * Kích thước vùng lưới đến từ `onLayout`, thứ không bao giờ nổ trong test renderer.
 *
 * Không bắn tay thì `viewport` ở lại {0,0} và lưới KHÔNG dựng — đúng như trên máy thật trước lần
 * đo đầu tiên. 390×600 là một màn hình phổ thông; bề rộng đó cho 7 cột chạm sàn 46dp.
 */
async function layoutGrid(view: Screen) {
  const grid = await view.findByLabelText('Lịch thuê xe theo ngày');
  await act(async () => {
    fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 390, height: 600 } } });
  });
  return grid;
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
  mockRouteParams = {};
  // Store là SINGLETON — scope chi nhánh của test trước sống sang test sau nếu không dọn.
  store.dispatch(branchScopeReset());
  jest.spyOn(branchesApi, 'list').mockResolvedValue({
    items: [],
    total: 0,
    activeCount: 0,
    needsReviewCount: 0,
  });
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CalendarScreen — quyền', () => {
  it('thiếu `calendar.view`: KHÔNG gọi API lịch, hiện màn từ chối', async () => {
    const spies = mockCalendar();
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    expect(await view.findByText('Không có quyền xem lịch xe')).toBeTruthy();
    expect(spies.resources).not.toHaveBeenCalled();
    expect(spies.events).not.toHaveBeenCalled();
  });

  it('chỉ có `calendar.view`: ô lịch KHÔNG mời thao tác — chỉ xem', async () => {
    mockCalendar();
    const view = await renderScreen([PERMISSION.CALENDAR_VIEW]);

    // Câu gợi ý "chọn ngày trống để tạo lịch" chỉ hiện khi có ít nhất một hành động.
    expect(await view.findByText('Chưa có lịch trong khoảng này.')).toBeTruthy();
    expect(view.queryByText(/chọn ngày trống để tạo lịch/)).toBeNull();
  });

  it('có quyền thao tác: mời người dùng chọn ô trống', async () => {
    mockCalendar();
    const view = await renderScreen();

    expect(
      await view.findByText('Chưa có lịch trong khoảng này — chọn ngày trống để tạo lịch.'),
    ).toBeTruthy();
  });
});

describe('CalendarScreen — tham số truy vấn', () => {
  it('gửi khoảng theo giờ VN và KHÔNG bao giờ gửi tenantId', async () => {
    const spies = mockCalendar();
    await renderScreen();

    await waitFor(() => expect(spies.resources).toHaveBeenCalled());
    const query = spies.resources.mock.calls[0]![0] as Record<string, unknown>;

    expect(query.startAt).toBe(RANGE_START);
    // 3 ngày mặc định ⇒ biên nửa mở là 00:00 VN ngày 15/07.
    expect(query.endAt).toBe('2026-07-14T17:00:00.000Z');
    expect(query).not.toHaveProperty('tenantId');
  });

  it('`sort` CHỈ đi vào query của resources — ba query kia không mang nó', async () => {
    const spies = mockCalendar();
    await renderScreen();

    await waitFor(() => expect(spies.events).toHaveBeenCalled());

    expect(spies.resources.mock.calls[0]![0]).toHaveProperty('sort', 'next_booking');
    expect(spies.events.mock.calls[0]![0]).not.toHaveProperty('sort');
    expect(spies.availability.mock.calls[0]![0]).not.toHaveProperty('sort');
    expect(spies.dailyPrices.mock.calls[0]![0]).not.toHaveProperty('sort');
  });

  it('gieo `q` từ route param và gửi lên API — lối "Xem lịch" của một xe', async () => {
    mockRouteParams = { q: '43A-123.45' };
    const spies = mockCalendar();
    await renderScreen();

    await waitFor(() => expect(spies.resources).toHaveBeenCalled());
    expect(spies.resources.mock.calls[0]![0]).toHaveProperty('q', '43A-123.45');
  });

  it('LỐI VÀO THỨ HAI đổi `?q=`: lọc theo xe MỚI, không giữ xe của lần trước', async () => {
    /*
     * Lịch là một TAB — state sống qua các lần mở. Nếu bộ lọc chỉ đọc route param lúc mount thì
     * "Xem lịch" ở xe thứ hai hiện lại lịch đã lọc theo xe thứ nhất, im lặng. Lỗi chỉ lộ ra ở
     * lần bấm thứ HAI, nên test phải render lại với tham số mới trên cùng một cây.
     */
    mockRouteParams = { q: '43A-111.11' };
    const spies = mockCalendar();
    const view = await renderScreen();
    await waitFor(() =>
      expect(spies.resources.mock.calls.at(-1)![0]).toHaveProperty('q', '43A-111.11'),
    );

    mockRouteParams = { q: '43A-222.22' };
    await act(async () => {
      await view.rerender(wrap(<CalendarScreen />, makeClient()));
    });

    await waitFor(() =>
      expect(spies.resources.mock.calls.at(-1)![0]).toHaveProperty('q', '43A-222.22'),
    );
  });

  it('mang `branchId` của bộ chọn chi nhánh vào MỌI query của lưới', async () => {
    jest.spyOn(branchesApi, 'list').mockResolvedValue({
      items: [
        {
          id: BRANCH_ID,
          code: 'CN01',
          name: 'Chi nhánh Hải Châu',
          provinceCode: '48',
          provinceName: 'Đà Nẵng',
          address: '12 Bạch Đằng',
          phone: '0901234567',
          latitude: null,
          longitude: null,
          isDefault: true,
          status: 'active',
          vehicleCount: 4,
          needsLocationReview: false,
          legacyProvinceValue: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      activeCount: 1,
      needsReviewCount: 0,
    });
    store.dispatch(branchSelected(BRANCH_ID));

    const spies = mockCalendar();
    await renderScreen();

    await waitFor(() =>
      expect(spies.events.mock.calls.at(-1)![0]).toHaveProperty('branchId', BRANCH_ID),
    );
    expect(spies.resources.mock.calls.at(-1)![0]).toHaveProperty('branchId', BRANCH_ID);
    expect(spies.availability.mock.calls.at(-1)![0]).toHaveProperty('branchId', BRANCH_ID);
  });

  it('lọc LOẠI XE đi qua tấm trượt Bộ lọc, y như màn Xe — không phải dải viên trên màn', async () => {
    /*
     * Bộ lọc nằm sau MỘT nút có huy hiệu đếm (`ManageFilterSheet`), giống mọi màn danh sách của
     * khu quản lý. Bày hết ra thanh công cụ thì lưới — thứ người ta mở màn này để nhìn — chỉ còn
     * ba hàng xe.
     */
    const spies = mockCalendar();
    const view = await renderScreen();
    await waitFor(() => expect(spies.resources).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(await view.findByLabelText('Mở bộ lọc'));
    });
    await act(async () => {
      fireEvent.press(await view.findByText('Ô tô'));
    });
    await act(async () => {
      fireEvent.press(await view.findByText('Áp dụng'));
    });

    await waitFor(() =>
      expect(spies.resources.mock.calls.at(-1)![0]).toHaveProperty('vehicleType', 'car'),
    );
  });

  it('đổi KHOẢNG XEM trong bộ lọc đổi luôn khoảng hỏi backend', async () => {
    const spies = mockCalendar();
    const view = await renderScreen();
    await waitFor(() => expect(spies.resources).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(await view.findByLabelText('Mở bộ lọc'));
    });
    await act(async () => {
      fireEvent.press(await view.findByText('3 ngày'));
    });
    await act(async () => {
      fireEvent.press(await view.findByText('Áp dụng'));
    });

    await waitFor(() => {
      const last = spies.resources.mock.calls.at(-1)![0] as Record<string, unknown>;
      // 3 ngày từ 12/07 ⇒ biên nửa mở là 00:00 VN ngày 15/07.
      expect(last.endAt).toBe('2026-07-14T17:00:00.000Z');
    });
  });

  /**
   * Nhãn khoảng phải có NĂM.
   *
   * Hàng header của lưới chỉ in "T5 10 · T6 11", nên nhãn này là chỗ duy nhất trên màn trả lời
   * "tháng mấy, năm mấy". Đã có một bản bỏ năm đi cho vừa một hàng chung với nút Lọc, và mất
   * luôn câu trả lời đó.
   */
  it('nhãn khoảng nói đủ ngày, tháng và NĂM', async () => {
    mockCalendar();
    const view = await renderScreen();

    // Hôm nay 12/07/2026 + 3 ngày mặc định ⇒ 14/07/2026.
    expect(view.getByText('12/07 – 14/07/2026')).toBeTruthy();
  });

  it('hỏi ngày lễ theo biên INCLUSIVE của khoảng đang xem', async () => {
    const spies = mockCalendar();
    await renderScreen();

    await waitFor(() => expect(spies.holidays).toHaveBeenCalledWith('2026-07-12', '2026-07-14'));
  });

  it('đổi khoảng xem gọi lại API với khoảng MỚI (không giữ khoảng cũ)', async () => {
    const spies = mockCalendar();
    const view = await renderScreen();

    await waitFor(() => expect(spies.resources).toHaveBeenCalled());
    await act(async () => {
      fireEvent.press(view.getByLabelText('Tiến 3 ngày'));
    });

    await waitFor(() => {
      const last = spies.resources.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(last.startAt).toBe('2026-07-14T17:00:00.000Z');
    });
  });

  /** Lối tắt "Hôm nay" phải quay về khoảng mặc định, kể cả khi vào màn từ một ngày khác. */
  it('"Hôm nay" đưa khoảng xem về hôm nay', async () => {
    mockRouteParams = { from: '2026-07-26' };
    const spies = mockCalendar();
    const view = await renderScreen();

    await waitFor(() => {
      const first = spies.resources.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(first.startAt).toBe('2026-07-25T17:00:00.000Z');
    });

    await act(async () => {
      fireEvent.press(view.getByText('Hôm nay'));
    });

    await waitFor(() => {
      const last = spies.resources.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(last.startAt).toBe(RANGE_START);
    });
  });
});

describe('CalendarScreen — trạng thái màn hình', () => {
  it('chưa có xe nào: nói ra, và KHÔNG mời lọc lại', async () => {
    mockCalendar({ resources: [] });
    const view = await renderScreen();

    expect(await view.findByText('Chưa có xe nào')).toBeTruthy();
    expect(view.queryByText('Không có xe nào khớp bộ lọc')).toBeNull();
  });

  it('đang LỌC mà rỗng: nói "không khớp bộ lọc", kèm lối xoá lọc', async () => {
    mockRouteParams = { q: 'không-có-xe-nào-tên-này' };
    mockCalendar({ resources: [] });
    const view = await renderScreen();

    expect(await view.findByText('Không có xe nào khớp bộ lọc')).toBeTruthy();
  });

  it('lỗi mạng khi chưa có dữ liệu: hiện lỗi + nút thử lại', async () => {
    mockCalendar();
    jest.spyOn(calendarApi, 'resources').mockRejectedValue(new Error('offline'));
    jest.spyOn(calendarApi, 'events').mockRejectedValue(new Error('offline'));

    const view = await renderScreen();

    expect(await view.findByText('Không tải được lịch')).toBeTruthy();
  });
});

describe('CalendarScreen — event trên lưới', () => {
  it('đơn thuê: nhãn trợ năng nói đủ loại, tên, khoảng và trạng thái', async () => {
    mockCalendar({ events: [bookingEvent()] });
    const view = await renderScreen();
    await layoutGrid(view);

    const bar = await view.findByLabelText(/Đơn thuê, DH1234 · Nguyễn Văn A/);
    expect(bar).toBeTruthy();
    expect(bar.props.accessibilityLabel).toContain('Đang thuê');
  });

  /**
   * MỘT cú chạm, không phải hai.
   *
   * Web có một thẻ xem nhanh cho thanh event, nhưng nó mở bằng `trigger={['hover', 'focus']}` —
   * cú CLICK thì đi thẳng vào modal chi tiết. Bản đầu ở đây dịch thẻ hover đó thành một tấm trượt
   * mở bằng cú chạm và thành ra chạm hai lần cho một việc.
   */
  it('chạm thanh đơn thuê: vào THẲNG chi tiết đơn', async () => {
    mockCalendar({ events: [bookingEvent()] });
    const view = await renderScreen();
    await layoutGrid(view);

    await act(async () => {
      fireEvent.press(await view.findByLabelText(/Đơn thuê, DH1234/));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/manage/bookings/[id]',
      params: { id: BOOKING_ID },
    });
  });

  it('yêu cầu thuê đã duyệt: dẫn về HỘP THƯ — web bỏ sót nhánh này', async () => {
    mockCalendar({
      events: [
        bookingEvent({
          id: 'ev-request',
          type: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST,
          title: 'YC0007 · Trần Thị B',
          status: null,
          sourceId: '01JQZX0000000000000000000R',
        }),
      ],
    });
    const view = await renderScreen();
    await layoutGrid(view);

    await act(async () => {
      fireEvent.press(await view.findByLabelText(/Chờ giữ chỗ/));
    });

    expect(mockPush).toHaveBeenCalledWith('/manage/requests');
  });

  it('khoá xe: nhãn tra ở nhóm `vehicleBlockReason`, KHÔNG phải nhóm trạng thái đơn', async () => {
    mockCalendar({ events: [blockEvent()] });
    const view = await renderScreen();
    await layoutGrid(view);

    const bar = await view.findByLabelText(/Xe bị khóa/);
    // Sai nhóm thì mã `unplanned_maintenance` lọt thẳng ra màn hình.
    expect(bar.props.accessibilityLabel).not.toContain('unplanned_maintenance');
  });

  it('chạm thanh khoá xe: mở CHI TIẾT KHOÁ, không rời màn lịch', async () => {
    mockCalendar({ events: [blockEvent()] });
    jest.spyOn(calendarApi, 'block').mockResolvedValue({
      id: BLOCK_ID,
      vehicleId: VEHICLE_ID,
      vehicleName: 'Toyota Vios',
      vehiclePlate: '43A-123.45',
      startAt: '2026-07-12T01:00:00.000Z',
      endAt: '2026-07-13T01:00:00.000Z',
      reason: VEHICLE_BLOCK_REASON.UNPLANNED_MAINTENANCE,
      note: null,
      rowVersion: 1,
      createdByName: 'Chủ shop',
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
    });

    const view = await renderScreen();
    await layoutGrid(view);
    await act(async () => {
      fireEvent.press(await view.findByLabelText(/Xe bị khóa/));
    });

    expect(await view.findByText('Lịch khoá xe')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('CalendarScreen — ô trống mở bộ chọn hành động', () => {
  it('chỉ bày những hành động người dùng CÓ quyền', async () => {
    mockCalendar();
    const view = await renderScreen([PERMISSION.CALENDAR_VIEW, PERMISSION.VEHICLE_BLOCK_SCHEDULE]);
    await layoutGrid(view);

    await act(async () => {
      fireEvent.press(await view.findByLabelText(/Tạo lịch cho Toyota Vios ngày 12\/07/));
    });

    expect(await view.findByText('Khóa xe')).toBeTruthy();
    expect(view.queryByText('Đặt xe')).toBeNull();
    expect(view.queryByText('Đặt giá')).toBeNull();
  });

  it('"Đặt xe" mang XE và KHOẢNG của ô sang form tạo đơn — giờ nhận 08:00 giờ VN', async () => {
    mockCalendar();
    const view = await renderScreen();
    await layoutGrid(view);

    await act(async () => {
      fireEvent.press(await view.findByLabelText(/Tạo lịch cho Toyota Vios ngày 12\/07/));
    });
    await act(async () => {
      fireEvent.press(await view.findByText('Đặt xe'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/manage/bookings/new',
      params: {
        vehicleId: VEHICLE_ID,
        // Tên đi CÙNG id: màn tạo đơn không phải hỏi lại `GET /vehicles/:id`, một endpoint đòi
        // `vehicles.view` — quyền mà `bookings.create` không bao hàm.
        vehicleName: 'Toyota Vios',
        // 08:00 giờ VN ngày 12/07 = 01:00 UTC.
        pickupAt: '2026-07-12T01:00:00.000Z',
        returnAt: '2026-07-13T01:00:00.000Z',
      },
    });
  });
});
