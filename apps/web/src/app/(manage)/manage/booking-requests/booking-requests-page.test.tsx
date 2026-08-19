import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_REQUEST_STATUS,
  PERMISSION,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  TENANT_CUSTOMER_RISK_LEVEL,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type {
  BookingRequestItem,
  BookingRequestListMeta,
} from '@/features/booking-requests/types';
import BookingRequestsPage from './page';

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/booking-requests',
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

const queries = vi.hoisted(() => ({
  list: {
    data: undefined as { items: BookingRequestItem[]; meta: BookingRequestListMeta } | undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  /** Filter mà trang truyền xuống hook — dùng để khẳng định mặc định và `status=all`. */
  lastFilters: undefined as Record<string, unknown> | undefined,
}));
vi.mock('@/features/booking-requests/hooks/use-booking-requests', () => ({
  useBookingRequests: (filters: Record<string, unknown>) => {
    queries.lastFilters = filters;
    return queries.list;
  },
}));

const mutations = vi.hoisted(() => ({
  approve: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
  reject: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
  conversation: { mutate: vi.fn(), isPending: false, variables: undefined as unknown },
}));
vi.mock('@/features/booking-requests/hooks/use-booking-request-mutations', () => ({
  useApproveBookingRequest: () => mutations.approve,
  useRejectBookingRequest: () => mutations.reject,
  useStartBookingRequestConversation: () => mutations.conversation,
}));

// Hộp thoại duyệt dài hạn tự gọi giá gói — không phải thứ màn này kiểm, cắt ở biên API.
vi.mock('@/features/calendar/api', () => ({ fetchCalendarQuote: vi.fn(async () => null) }));

/*
 * Chi tiết đơn là modal DÙNG CHUNG của feature bookings (đã có test riêng ở đó). Ở đây chỉ cần
 * biết ĐÚNG đơn nào được mở, nên mock thành một marker thay vì dựng cả cây chi tiết.
 */
vi.mock('@/features/bookings/components/BookingDetailDialog', () => ({
  BookingDetailDialog: ({ bookingId, open }: { bookingId: string; open: boolean }) =>
    open ? <div data-testid="booking-detail-dialog">{bookingId}</div> : null,
}));

/*
 * Hồ sơ xe và hồ sơ khách cũng là màn DÙNG CHUNG với route của chúng — ở đây chỉ cần biết
 * đúng hồ sơ nào được mở, nên mock thành marker giống hệt cách test lịch đang làm.
 */
vi.mock('@/features/vehicles/components/VehicleDetailDialog', () => ({
  VehicleDetailDialog: ({ vehicleId, open }: { vehicleId: string; open: boolean }) =>
    open ? <div data-testid="vehicle-detail-dialog">{vehicleId}</div> : null,
}));
vi.mock('@/features/customers/components/CustomerDetailDialog', () => ({
  CustomerDetailDialog: ({ customerId, open }: { customerId: string; open: boolean }) =>
    open ? <div data-testid="customer-detail-dialog">{customerId}</div> : null,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

/** 19/08/2026 10:00 giờ VN (thứ Tư) → 22/08 10:00 (thứ Bảy). */
const PICKUP_AT = '2026-08-19T03:00:00.000Z';
const RETURN_AT = '2026-08-22T03:00:00.000Z';

function request(overrides: Partial<BookingRequestItem> = {}): BookingRequestItem {
  return {
    id: 'req-1',
    vehicleId: 'veh-1',
    vehicleName: 'Kia Carnival 2025',
    vehiclePlate: '51A-123.45',
    vehicleCode: 'XE-001',
    vehicleImageUrl: 'https://cdn.test/kia.jpg',
    vehicleType: VEHICLE_TYPE.CAR,
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    customerName: 'Nguyễn Văn An',
    customerPhone: '0901234567',
    customerEmail: 'an@test.vn',
    tenantCustomerId: 'cus-1',
    customerAvatarUrl: null,
    customerRiskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL,
    canMessageOnPlatform: true,
    pickupAt: PICKUP_AT,
    returnAt: RETURN_AT,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    longTermPackageMonths: null,
    pickupPreference: null,
    requestedPickupDate: null,
    pickupWindowStartDate: null,
    pickupWindowEndDate: null,
    routeType: null,
    pickupAddress: null,
    destination: null,
    note: null,
    deliveryRequested: false,
    deliveryAddress: null,
    deliveryQuote: null,
    rejectReason: null,
    bookingId: null,
    createdAt: '2026-08-18T02:00:00.000Z',
    decidedAt: null,
    ...overrides,
  } as BookingRequestItem;
}

function meta(overrides: Partial<BookingRequestListMeta> = {}): BookingRequestListMeta {
  return {
    page: 1,
    limit: 20,
    total: 1,
    hasNext: false,
    statusCounts: [
      { status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, count: 7 },
      { status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, count: 12 },
      { status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST, count: 3 },
      { status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER, count: 2 },
      { status: BOOKING_REQUEST_STATUS.EXPIRED, count: 1 },
      { status: BOOKING_REQUEST_STATUS.APPROVED_BY_HOST, count: 0 },
    ],
    ...overrides,
  };
}

function setRows(items: BookingRequestItem[], metaOverrides: Partial<BookingRequestListMeta> = {}) {
  queries.list = {
    data: { items, meta: meta({ total: items.length, ...metaOverrides }) },
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function renderPage(locale?: 'vi' | 'en') {
  const ui = (
    <App>
      <BookingRequestsPage />
    </App>
  );
  return locale ? renderWithIntl(ui, { locale }) : render(ui);
}

/** Thẻ của một yêu cầu — mỗi `<li>` bọc đúng một `<article>`. */
function cardFor(vehicleName: string): HTMLElement {
  const article = screen.getByText(vehicleName).closest('article');
  if (!article) throw new Error(`Không tìm thấy thẻ của xe ${vehicleName}`);
  return article as HTMLElement;
}

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.BOOKING_REQUEST_VIEW,
    PERMISSION.BOOKING_REQUEST_APPROVE,
    PERMISSION.VEHICLE_VIEW,
    PERMISSION.CUSTOMER_VIEW,
    PERMISSION.BOOKING_VIEW,
  ]);
  nav.params = new URLSearchParams();
  nav.push.mockClear();
  nav.replace.mockClear();
  mutations.approve = { mutate: vi.fn(), isPending: false, variables: undefined };
  mutations.reject = { mutate: vi.fn(), isPending: false, variables: undefined };
  mutations.conversation = { mutate: vi.fn(), isPending: false, variables: undefined };
  queries.lastFilters = undefined;
  setRows([request()]);
});
afterEach(cleanup);

describe('/manage/booking-requests — bộ lọc trạng thái ở URL', () => {
  it('không có tham số ⇒ mặc định lọc "chờ duyệt"', () => {
    renderPage();
    expect(queries.lastFilters?.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });

  it('chọn tab "Tất cả" ⇒ ghi `status=all` vào URL (không phải xoá tham số)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Tất cả/ }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/booking-requests?status=all', {
      scroll: false,
    });
  });

  it('`status=all` trong URL được GIỮ và không gửi `status` lên API', () => {
    nav.params = new URLSearchParams('status=all');
    renderPage();
    expect(queries.lastFilters?.status).toBe('all');
    expect(screen.getByRole('tab', { name: /Tất cả/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('đổi trạng thái ⇒ về trang 1 (tham số `page` bị xoá khỏi URL)', () => {
    nav.params = new URLSearchParams('status=pending_host_approval&page=4');
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Đã từ chối/ }));
    expect(nav.replace).toHaveBeenCalledWith(
      '/manage/booking-requests?status=rejected_by_host',
      { scroll: false },
    );
  });

  it('đếm trên tab lấy từ backend, kể cả tab đang KHÔNG mở; "Tất cả" là tổng', () => {
    renderPage();
    expect(within(screen.getByRole('tab', { name: /Cần xử lý/ })).getByText('7')).toBeTruthy();
    expect(within(screen.getByRole('tab', { name: /Đã tạo đơn/ })).getByText('12')).toBeTruthy();
    expect(within(screen.getByRole('tab', { name: /Đã từ chối/ })).getByText('3')).toBeTruthy();
    // 7 + 12 + 3 + 2 + 1 + 0 — cộng ĐỦ bộ trạng thái, không chỉ các tab hiện ra.
    expect(within(screen.getByRole('tab', { name: /Tất cả/ })).getByText('25')).toBeTruthy();
  });
});

describe('/manage/booking-requests — vùng xe và khách', () => {
  it('xe: ảnh, tên, mã + biển số, loại xe và dịch vụ', () => {
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByText('XE-001 · 51A-123.45')).toBeTruthy();
    expect(within(card).getByText('Ô tô')).toBeTruthy();
    expect(within(card).getByText('Tự lái')).toBeTruthy();
    expect(card.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/kia.jpg');
  });

  it('có quyền xem xe ⇒ tên xe là link tới hồ sơ xe', () => {
    renderPage();
    expect(
      screen.getByRole('link', { name: 'Kia Carnival 2025' }).getAttribute('href'),
    ).toBe('/manage/vehicles/veh-1');
  });

  it('thiếu `vehicles.view` ⇒ hiện CHỮ, không phải link dẫn tới màn 403', () => {
    permissions.granted.delete(PERMISSION.VEHICLE_VIEW);
    renderPage();
    expect(screen.getByText('Kia Carnival 2025')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Kia Carnival 2025' })).toBeNull();
  });

  it('khách: tên là link hồ sơ, SĐT là link gọi, email hiện khi có', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Nguyễn Văn An' }).getAttribute('href')).toBe(
      '/manage/customers/cus-1',
    );
    expect(screen.getByRole('link', { name: '0901234567' }).getAttribute('href')).toBe(
      'tel:0901234567',
    );
    expect(screen.getByText('an@test.vn')).toBeTruthy();
  });

  it('thiếu `customers.view` HOẶC chưa có hồ sơ ⇒ tên khách là chữ thường', () => {
    permissions.granted.delete(PERMISSION.CUSTOMER_VIEW);
    renderPage();
    expect(screen.queryByRole('link', { name: 'Nguyễn Văn An' })).toBeNull();

    cleanup();
    permissions.granted.add(PERMISSION.CUSTOMER_VIEW);
    setRows([request({ tenantCustomerId: null })]);
    renderPage();
    expect(screen.queryByRole('link', { name: 'Nguyễn Văn An' })).toBeNull();
    expect(screen.getByText('Chưa có hồ sơ trong sổ khách')).toBeTruthy();
  });

  it('mức rủi ro: `normal` KHÔNG hiện, `blocked` hiện rõ thành chữ', () => {
    renderPage();
    expect(screen.queryByText(/Bình thường/)).toBeNull();

    cleanup();
    setRows([request({ customerRiskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED })]);
    renderPage();
    expect(screen.getByText(/Từ chối phục vụ — kiểm tra lại trước khi duyệt/)).toBeTruthy();
  });
});

describe('/manage/booking-requests — lịch, lộ trình, giao nhận, ghi chú', () => {
  it('dịch vụ theo ngày: mốc nhận/trả có THỨ + ngày + giờ, và thời lượng', () => {
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    // 19/08/2026 là thứ Tư → `T4`; giờ Việt Nam 10:00 (dữ liệu là 03:00 UTC).
    expect(within(card).getByText('T4, 19/08 · 10:00')).toBeTruthy();
    expect(within(card).getByText('T7, 22/08 · 10:00')).toBeTruthy();
    expect(within(card).getByText('3 ngày')).toBeTruthy();
  });

  it('cùng dữ liệu, giao diện tiếng Anh đổi thứ và mẫu ngày', () => {
    renderPage('en');
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByText('Wed, 08/19 · 10:00')).toBeTruthy();
    expect(within(card).getByText('Sat, 08/22 · 10:00')).toBeTruthy();
    expect(within(card).getByText('3 days')).toBeTruthy();
  });

  it('thuê dài hạn chưa duyệt: nói GÓI + nguyện vọng, KHÔNG bịa ra khoảng ngày', () => {
    setRows([
      request({
        serviceType: SERVICE_TYPE.LONG_TERM,
        pickupAt: null,
        returnAt: null,
        longTermPackageMonths: 9,
        pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
        requestedPickupDate: '2026-09-01',
      }),
    ]);
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByText('9 tháng')).toBeTruthy();
    expect(within(card).getByText(/Chọn ngày cụ thể: 01\/09\/2026/)).toBeTruthy();
    expect(within(card).getByText('Giờ nhận chính xác do gian hàng chốt khi duyệt.')).toBeTruthy();
    // Không có mốc nhận/trả nào được dựng ra từ hư không.
    expect(within(card).queryByText('Nhận xe')).toBeNull();
    expect(within(card).queryByText('Trả xe')).toBeNull();
  });

  it('thuê dài hạn ĐÃ duyệt: hiện lịch đã chốt bên cạnh gói', () => {
    setRows([
      request({
        serviceType: SERVICE_TYPE.LONG_TERM,
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        longTermPackageMonths: 3,
      }),
    ]);
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByText('T4, 19/08 · 10:00')).toBeTruthy();
    expect(within(card).getByText('3 tháng')).toBeTruthy();
  });

  it('có tài xế: lộ trình, địa chỉ đón và điểm đến', () => {
    setRows([
      request({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: ROUTE_TYPE.INTER_CITY_ONE_WAY,
        pickupAddress: '12 Nguyễn Huệ, Quận 1',
        destination: 'Đà Lạt',
      }),
    ]);
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByText('Liên tỉnh (1 chiều)')).toBeTruthy();
    expect(within(card).getByText('12 Nguyễn Huệ, Quận 1')).toBeTruthy();
    expect(within(card).getByText('Đà Lạt')).toBeTruthy();
  });

  it('giao tận nơi: hiện ĐỦ địa chỉ giao (không giấu trong tooltip)', () => {
    setRows([
      request({ deliveryRequested: true, deliveryAddress: '99 Lê Lợi, Quận 3, TP.HCM' }),
    ]);
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByText('Giao xe tận nơi')).toBeTruthy();
    expect(within(card).getByText('99 Lê Lợi, Quận 3, TP.HCM')).toBeTruthy();
    expect(
      within(card).getByText('Phí giao nhận chốt trên đơn sau khi hai bên thống nhất.'),
    ).toBeTruthy();
  });

  it('không giao tận nơi: vẫn nói rõ khách tự đến nhận (im lặng bị đọc nhầm)', () => {
    renderPage();
    expect(within(cardFor('Kia Carnival 2025')).getByText('Khách tự đến nhận')).toBeTruthy();
  });

  it('ghi chú của khách hiện thành văn bản và mở rộng được', () => {
    setRows([request({ note: 'Cho mình xin xe màu trắng và giao trước 8h sáng nhé.' })]);
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(
      within(card).getByText('Cho mình xin xe màu trắng và giao trước 8h sáng nhé.'),
    ).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Xem đầy đủ' }));
    expect(within(card).getByRole('button', { name: 'Thu gọn' })).toBeTruthy();
  });
});

describe('/manage/booking-requests — quyết định duyệt/từ chối', () => {
  it('yêu cầu chờ duyệt + đủ quyền ⇒ có cả Duyệt và Từ chối', () => {
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).getByRole('button', { name: /Duyệt/ })).toBeTruthy();
    expect(within(card).getByRole('button', { name: /Từ chối/ })).toBeTruthy();
  });

  it('thiếu `booking_requests.approve` ⇒ ẨN HẲN hai nút (không nút giả bị khoá)', () => {
    permissions.granted.delete(PERMISSION.BOOKING_REQUEST_APPROVE);
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).queryByRole('button', { name: /Duyệt/ })).toBeNull();
    expect(within(card).queryByRole('button', { name: /Từ chối/ })).toBeNull();
    // Liên hệ vẫn còn: người trực không có quyền duyệt vẫn phải gọi được cho khách.
    expect(within(card).getByRole('button', { name: /Nhắn tin cho/ })).toBeTruthy();
  });

  it('yêu cầu đã xử lý ⇒ không còn nút quyết định', () => {
    setRows([
      request({ status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST, rejectReason: 'Xe đang bảo dưỡng' }),
    ]);
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(within(card).queryByRole('button', { name: /^Duyệt/ })).toBeNull();
    expect(within(card).getByText('Xe đang bảo dưỡng')).toBeTruthy();
  });

  it('duyệt dịch vụ theo ngày: hỏi xác nhận có xe + lịch trước khi tạo đơn', async () => {
    renderPage();
    fireEvent.click(within(cardFor('Kia Carnival 2025')).getByRole('button', { name: /Duyệt/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Duyệt sẽ tạo đơn thuê và GIỮ CHỖ lịch/)).toBeTruthy();
    expect(within(dialog).getByText('Kia Carnival 2025 · 51A-123.45')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Duyệt và tạo đơn' }));
    expect(mutations.approve.mutate).toHaveBeenCalledWith(
      { id: 'req-1', body: undefined },
      expect.anything(),
    );
  });

  it('thuê dài hạn đi hộp thoại CHỐT LỊCH riêng, không phải hộp xác nhận nhanh', async () => {
    setRows([
      request({
        serviceType: SERVICE_TYPE.LONG_TERM,
        pickupAt: null,
        returnAt: null,
        longTermPackageMonths: 3,
        pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
        pickupWindowStartDate: '2026-09-01',
        pickupWindowEndDate: '2026-09-07',
      }),
    ]);
    renderPage();
    fireEvent.click(within(cardFor('Kia Carnival 2025')).getByRole('button', { name: /Duyệt/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Duyệt yêu cầu thuê dài hạn')).toBeTruthy();
    expect(within(dialog).getByText('Ngày và giờ nhận xe (bắt buộc)')).toBeTruthy();
    expect(mutations.approve.mutate).not.toHaveBeenCalled();
  });

  it('từ chối: BẮT BUỘC lý do, và gửi đúng chữ đã nhập', async () => {
    renderPage();
    fireEvent.click(within(cardFor('Kia Carnival 2025')).getByRole('button', { name: /Từ chối/ }));

    const dialog = await screen.findByRole('dialog');
    // Bấm gửi khi chưa có lý do: không gọi API, hiện lỗi ngay tại ô nhập.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối yêu cầu' }));
    expect(mutations.reject.mutate).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText('Nhập lý do để khách biết vì sao yêu cầu bị từ chối'),
    ).toBeTruthy();

    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Xe đang bảo dưỡng tới hết tuần sau.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối yêu cầu' }));
    expect(mutations.reject.mutate).toHaveBeenCalledWith(
      { id: 'req-1', reason: 'Xe đang bảo dưỡng tới hết tuần sau.' },
      expect.anything(),
    );
  });

  it('mẫu lý do bấm-là-điền, và vẫn sửa lại được', async () => {
    renderPage();
    fireEvent.click(within(cardFor('Kia Carnival 2025')).getByRole('button', { name: /Từ chối/ }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByText('Xe hiện không sẵn sàng cho khoảng thời gian này.'));
    const textarea = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Xe hiện không sẵn sàng cho khoảng thời gian này.');

    fireEvent.change(textarea, { target: { value: 'Xe vừa có khách khác đặt trước.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối yêu cầu' }));
    expect(mutations.reject.mutate).toHaveBeenCalledWith(
      { id: 'req-1', reason: 'Xe vừa có khách khác đặt trước.' },
      expect.anything(),
    );
  });

  it('đang chạy một quyết định ⇒ không bấm được quyết định thứ hai trên CÙNG yêu cầu', () => {
    mutations.approve = { mutate: vi.fn(), isPending: true, variables: { id: 'req-1' } };
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(
      (within(card).getByRole('button', { name: /Từ chối/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('/manage/booking-requests — liên hệ khách', () => {
  it('gọi và Zalo là LINK thật, có nhãn khả truy cập kèm tên khách', () => {
    renderPage();
    const card = cardFor('Kia Carnival 2025');
    expect(
      within(card)
        .getByRole('link', { name: 'Gọi Nguyễn Văn An theo số 0901234567' })
        .getAttribute('href'),
    ).toBe('tel:0901234567');
    const zalo = within(card).getByRole('link', {
      name: 'Mở Zalo với Nguyễn Văn An theo số 0901234567',
    });
    expect(zalo.getAttribute('href')).toBe('https://zalo.me/0901234567');
    expect(zalo.getAttribute('target')).toBe('_blank');
    expect(zalo.getAttribute('rel')).toContain('noopener');
  });

  it('nhắn tin: mở hội thoại phía GIAN HÀNG rồi chuyển sang khu tin nhắn', async () => {
    mutations.conversation.mutate = vi.fn((_id, options) =>
      options?.onSuccess?.({ id: 'conv-9' } as never),
    );
    renderPage();
    fireEvent.click(
      within(cardFor('Kia Carnival 2025')).getByRole('button', { name: /Nhắn tin cho/ }),
    );
    expect(mutations.conversation.mutate).toHaveBeenCalledWith('req-1', expect.anything());
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/manage/chat?c=conv-9'));
  });

  it('khách vãng lai (chưa có tài khoản) ⇒ nút nhắn tin bị khoá kèm lời giải thích', async () => {
    setRows([request({ canMessageOnPlatform: false })]);
    renderPage();
    const button = within(cardFor('Kia Carnival 2025')).getByRole('button', {
      name: /Nhắn tin cho/,
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.mouseOver(button.parentElement as HTMLElement);
    expect(
      await screen.findByText(
        'Khách gửi yêu cầu bằng số điện thoại và chưa có tài khoản XePrime — hãy gọi điện hoặc nhắn Zalo.',
      ),
    ).toBeTruthy();
  });
});

describe('/manage/booking-requests — trạng thái màn hình', () => {
  it('tải lần đầu: skeleton thẻ, không phải danh sách rỗng', () => {
    queries.list = { data: undefined, isFetching: true, isError: false, refetch: vi.fn() };
    renderPage();
    expect(screen.getByText('Đang tải yêu cầu thuê…')).toBeTruthy();
  });

  it('làm mới NỀN: giữ nguyên thẻ đang đọc, chỉ đánh dấu bận', () => {
    queries.list = {
      data: { items: [request()], meta: meta() },
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    };
    renderPage();
    expect(screen.getByText('Kia Carnival 2025')).toBeTruthy();
    expect(
      screen.getByRole('list', { name: 'Danh sách yêu cầu thuê' }).getAttribute('aria-busy'),
    ).toBe('true');
  });

  it('hộp thư "Cần xử lý" rỗng là tin vui, có câu riêng', () => {
    setRows([]);
    renderPage();
    expect(screen.getByText('Không có yêu cầu nào cần xử lý')).toBeTruthy();
  });

  it('tab đã lọc mà rỗng: nói không có kết quả khớp, không phải "hết việc"', () => {
    nav.params = new URLSearchParams('status=rejected_by_host');
    setRows([]);
    renderPage();
    expect(screen.getByText('Không có yêu cầu nào ở trạng thái này')).toBeTruthy();
  });

  it('lỗi tải: hiện màn lỗi có nút thử lại', () => {
    const refetch = vi.fn();
    queries.list = { data: undefined, isFetching: false, isError: true, refetch };
    renderPage();
    expect(screen.getByText('Không tải được danh sách yêu cầu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('yêu cầu đã thành đơn: mở chi tiết đơn dạng MODAL, không rời trang', () => {
    setRows([
      request({
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingId: 'bk-1',
        decidedAt: '2026-08-18T09:00:00.000Z',
      }),
    ]);
    renderPage();
    expect(screen.getByText(/Xử lý lúc/)).toBeTruthy();

    // Tên CHÍNH XÁC: vùng "Yêu cầu thuê" cũng bấm được nhưng tên nó có kèm tên xe.
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết đơn thuê' }));
    expect(screen.getByTestId('booking-detail-dialog').textContent).toBe('bk-1');
    // Điều hướng là thứ KHÔNG được xảy ra: người trực đang quét cả hộp thư.
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('cả vùng "Yêu cầu thuê" bấm được và mở đúng modal đó', () => {
    setRows([
      request({ status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, bookingId: 'bk-9' }),
    ]);
    renderPage();

    const card = cardFor('Kia Carnival 2025');
    fireEvent.click(
      within(card).getByRole('button', { name: /Xem chi tiết đơn thuê của Kia Carnival 2025/ }),
    );
    expect(screen.getByTestId('booking-detail-dialog').textContent).toBe('bk-9');
  });

  it('yêu cầu CHỜ DUYỆT cũng có màn chi tiết — mở hộp thoại chi tiết YÊU CẦU', () => {
    setRows([request({ note: 'Ghi chú rất dài của khách cần đọc đủ' })]);
    renderPage();

    const card = cardFor('Kia Carnival 2025');
    fireEvent.click(
      within(card).getByRole('button', { name: /Xem chi tiết đơn thuê của Kia Carnival 2025/ }),
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Chi tiết yêu cầu thuê')).toBeTruthy();
    // Trong hộp thoại ghi chú hiện ĐỦ, không cắt hai dòng như ở thẻ.
    expect(within(dialog).getByText('Ghi chú rất dài của khách cần đọc đủ')).toBeTruthy();
    // Không có đơn nên KHÔNG mở nhầm chi tiết đơn.
    expect(screen.queryByTestId('booking-detail-dialog')).toBeNull();
  });

  it('duyệt được ngay TRONG hộp thoại chi tiết yêu cầu', async () => {
    renderPage();
    fireEvent.click(
      within(cardFor('Kia Carnival 2025')).getByRole('button', {
        name: /Xem chi tiết đơn thuê của/,
      }),
    );

    const detail = screen.getByRole('dialog');
    fireEvent.click(within(detail).getByRole('button', { name: /Duyệt/ }));

    // Chi tiết đóng lại, nhường chỗ cho hộp xác nhận duyệt.
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Duyệt và tạo đơn' }));
    expect(mutations.approve.mutate).toHaveBeenCalledWith(
      { id: 'req-1', body: undefined },
      expect.anything(),
    );
  });

  it('thiếu `bookings.view` ⇒ rơi về chi tiết YÊU CẦU, không mở chi tiết đơn', () => {
    permissions.granted.delete(PERMISSION.BOOKING_VIEW);
    setRows([
      request({ status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, bookingId: 'bk-1' }),
    ]);
    renderPage();

    // Đường sang ĐƠN biến mất hoàn toàn…
    expect(screen.queryByRole('button', { name: 'Xem chi tiết đơn thuê' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Xem chi tiết đơn thuê của/ }));
    // …và bấm vào vùng yêu cầu KHÔNG mở được chi tiết đơn.
    expect(screen.queryByTestId('booking-detail-dialog')).toBeNull();
    expect(screen.getByText('Chi tiết yêu cầu thuê')).toBeTruthy();
  });
});

describe('/manage/booking-requests — xe và khách mở dạng modal', () => {
  it('bấm tên xe mở hồ sơ XE dạng modal, không rời trang', () => {
    renderPage();
    fireEvent.click(screen.getByRole('link', { name: 'Kia Carnival 2025' }));
    expect(screen.getByTestId('vehicle-detail-dialog').textContent).toBe('veh-1');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('bấm tên khách mở hồ sơ KHÁCH dạng modal', () => {
    renderPage();
    fireEvent.click(screen.getByRole('link', { name: 'Nguyễn Văn An' }));
    expect(screen.getByTestId('customer-detail-dialog').textContent).toBe('cus-1');
  });

  it('vẫn là LIÊN KẾT thật: Ctrl/Cmd+bấm để trình duyệt mở tab mới, không mở modal', () => {
    renderPage();
    const link = screen.getByRole('link', { name: 'Kia Carnival 2025' });
    expect(link.getAttribute('href')).toBe('/manage/vehicles/veh-1');

    fireEvent.click(link, { ctrlKey: true });
    expect(screen.queryByTestId('vehicle-detail-dialog')).toBeNull();

    fireEvent.click(link, { metaKey: true });
    expect(screen.queryByTestId('vehicle-detail-dialog')).toBeNull();
  });

  it('khách chưa có hồ sơ trong sổ khách ⇒ không có gì để mở', () => {
    setRows([request({ tenantCustomerId: null })]);
    renderPage();
    expect(screen.queryByRole('link', { name: 'Nguyễn Văn An' })).toBeNull();
    expect(screen.queryByTestId('customer-detail-dialog')).toBeNull();
  });
});

describe('/manage/booking-requests — xem lịch của chính chiếc xe', () => {
  it('link sang màn lịch đã lọc sẵn theo BIỂN SỐ, kèm đường quay lại', () => {
    nav.params = new URLSearchParams('status=all&page=3');
    renderPage();

    const link = screen.getByRole('link', {
      name: 'Xem lịch thuê của Kia Carnival 2025',
    });
    const href = link.getAttribute('href') ?? '';
    const [path, query] = href.split('?');
    const params = new URLSearchParams(query);

    expect(path).toBe('/manage/calendar');
    // Biển số phân biệt tốt hơn tên xe khi gian hàng có nhiều xe trùng tên.
    expect(params.get('q')).toBe('51A-123.45');
    // Quay lại ĐÚNG chỗ đang đứng: giữ cả tab lẫn trang.
    expect(params.get('back')).toBe('/manage/booking-requests?status=all&page=3');
  });

  it('xe chưa có biển số ⇒ lọc theo tên', () => {
    setRows([request({ vehiclePlate: null })]);
    renderPage();
    const href =
      screen.getByRole('link', { name: /Xem lịch thuê của/ }).getAttribute('href') ?? '';
    expect(new URLSearchParams(href.split('?')[1]).get('q')).toBe('Kia Carnival 2025');
  });

  it('thiếu `vehicles.view` ⇒ không có link lịch xe', () => {
    permissions.granted.delete(PERMISSION.VEHICLE_VIEW);
    renderPage();
    expect(screen.queryByRole('link', { name: /Xem lịch thuê của/ })).toBeNull();
  });
});

describe('/manage/booking-requests — thứ tự đọc trên điện thoại', () => {
  /**
   * Bố cục mobile là thứ tự DOM (CSS chỉ xếp lại ở tablet/desktop bằng `grid-template-areas`),
   * nên khẳng định thứ tự DOM chính là khẳng định thứ tự người dùng đọc trên điện thoại —
   * và nó không phụ thuộc vào việc jsdom có tính được layout hay không.
   */
  it('thân thẻ → ngữ cảnh thêm → chân thẻ; trong thân: xe → khách → trạng thái → lịch', () => {
    setRows([request({ note: 'Giao trước 8h nhé' })]);
    renderPage();
    const card = cardFor('Kia Carnival 2025');

    // Ba tầng của thẻ, đúng thứ tự.
    const sections = Array.from(card.children).map((el) => el.textContent ?? '');
    expect(sections[0]).toContain('Kia Carnival 2025');
    expect(sections[1]).toContain('Giao trước 8h nhé');
    expect(sections[2]).toContain('Zalo');

    // Trong THÂN thẻ: xe → khách → trạng thái → lịch thuê → mốc thời gian.
    const body = card.firstElementChild as HTMLElement;
    const blocks = Array.from(body.children).map((el) => el.textContent ?? '');
    expect(blocks[0]).toContain('Kia Carnival 2025');
    expect(blocks[1]).toContain('Nguyễn Văn An');
    expect(blocks[2]).toContain('Chờ chủ shop duyệt');
    expect(blocks[3]).toContain('Nhận xe');
    expect(blocks[4]).toContain('Khách gửi');

    // Trong CHÂN thẻ: liên hệ trước, quyết định sau.
    const footer = card.lastElementChild as HTMLElement;
    const actions = Array.from(footer.children).map((el) => el.textContent ?? '');
    expect(actions[0]).toContain('Nhắn tin');
    expect(actions[1]).toContain('Duyệt');
  });
});
