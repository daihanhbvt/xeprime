import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOKING_REQUEST_STATUS, BOOKING_STATUS, PERMISSION } from '@xeprime/types';

import type { TripBooking, TripRequest, TripSummary } from '../types';
import { TripOpsView } from './TripOpsView';

/**
 * Màn "Vận hành chuyến" — khoá: hàng đợi ở URL (mặc định không ghi tham số); dải tóm tắt trả lời
 * trước (hôm nay + số khẩn); hàng đợi chờ duyệt có nút nhắc chủ xe với cooldown; hàng đợi đơn có
 * chip quá giờ và mở panel chi tiết qua `?open=`.
 */
const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/admin/trips',
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
}

const summary = vi.hoisted(() => ({}) as QueryState<TripSummary>);
const requests = vi.hoisted(() => ({ lastFilters: undefined as unknown }) as QueryState<{
  items: TripRequest[];
  meta: unknown;
}> & { lastFilters: unknown });
const bookings = vi.hoisted(() => ({ lastFilters: undefined as unknown }) as QueryState<{
  items: TripBooking[];
  meta: unknown;
}> & { lastFilters: unknown });
const remind = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined as unknown,
}));

vi.mock('../hooks/use-admin-trips', () => ({
  useTripSummary: () => summary,
  useTripRequests: (filters: unknown) => {
    requests.lastFilters = filters;
    return requests;
  },
  useTripBookings: (filters: unknown) => {
    bookings.lastFilters = filters;
    return bookings;
  },
  useRemindTripRequest: () => remind,
}));

const drawer = vi.hoisted(() => ({ bookingId: null as string | null }));
vi.mock('@/features/admin-bookings/components/AdminBookingDetailDrawer', () => ({
  AdminBookingDetailDrawer: ({ bookingId }: { bookingId: string | null }) => {
    drawer.bookingId = bookingId;
    return bookingId ? <div data-testid="booking-drawer">{bookingId}</div> : null;
  },
}));

const messages = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('antd', async (importOriginal) =>
  (await import('@/test-utils/antd-mock')).antdWithApp(importOriginal, () => ({ message: messages })),
);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function settled<T>(data: T): QueryState<T> {
  return { data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
}

function makeSummary(over: Partial<TripSummary['queues']> = {}): TripSummary {
  return {
    generatedAt: at(0),
    today: { pickups: 3, returns: 2 },
    queues: {
      pending_approval: { count: 4, urgentCount: 1 },
      awaiting_hold: { count: 2, urgentCount: 0 },
      pickup_soon: { count: 5, urgentCount: 2 },
      active: { count: 12, urgentCount: 0 },
      ...over,
    },
  };
}

function request(over: Partial<TripRequest> = {}): TripRequest {
  return {
    id: 'r1',
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    customerName: 'Nguyễn Văn A',
    customerPhoneMasked: '091****678',
    serviceType: 'self_drive',
    pickupAt: at(2 * 24 * HOUR),
    returnAt: at(3 * 24 * HOUR),
    longTermPackageMonths: null,
    pickupPreference: null,
    requestedPickupDate: null,
    pickupWindowStartDate: null,
    pickupWindowEndDate: null,
    createdAt: at(-10 * MINUTE),
    respondBy: at(50 * MINUTE),
    firstRemindedAt: null,
    finalRemindedAt: null,
    decidedAt: null,
    holdExpiresAt: null,
    holdAmount: null,
    tenantId: 't1',
    tenantName: 'Gian hàng Demo',
    tenantStatus: 'active',
    ownerName: 'Chị Lan',
    ownerPhone: '0988111222',
    vehicleId: 'v1',
    vehicleName: 'Toyota Vios',
    vehiclePlateNumber: '51A-123.45',
    vehicleImageUrl: null,
    vehicleType: 'car',
    lastPlatformRemindAt: null,
    ...over,
  } as TripRequest;
}

function booking(over: Partial<TripBooking> = {}): TripBooking {
  return {
    id: 'b1',
    code: 'DH-001',
    status: BOOKING_STATUS.RESERVED,
    serviceType: 'self_drive',
    customerName: 'Trần B',
    customerPhoneMasked: '090****111',
    pickupAt: at(-2 * HOUR - 5 * MINUTE),
    returnAt: at(24 * HOUR),
    totalAmount: '1000000',
    paidAmount: '500000',
    debtAmount: '500000',
    tenantId: 't1',
    tenantName: 'Gian hàng Demo',
    tenantStatus: 'active',
    vehicleId: 'v1',
    vehicleName: 'Toyota Vios',
    vehiclePlateNumber: '51A-123.45',
    createdAt: at(-3 * 24 * HOUR),
    ...over,
  } as TripBooking;
}

function renderView() {
  return render(
    <App>
      <TripOpsView />
    </App>,
  );
}

const rail = () => screen.getByRole('navigation', { name: 'Chọn hàng đợi' });
const lastUrl = () => (nav.replace.mock.calls.at(-1)?.[0] as string | undefined) ?? '';

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.params = new URLSearchParams();
  perms.granted = new Set<string>([PERMISSION.PLATFORM_BOOKING_VIEW]);
  Object.assign(summary, settled(makeSummary()));
  Object.assign(requests, settled({ items: [request()], meta: META }));
  Object.assign(bookings, settled({ items: [booking()], meta: META }));
  remind.mutate.mockReset();
  remind.isPending = false;
  remind.variables = undefined;
  messages.success.mockReset();
  messages.error.mockReset();
  drawer.bookingId = null;
});

afterEach(cleanup);

describe('Vận hành chuyến — khung màn', () => {
  it('mặc định mở hàng đợi chờ chủ xe duyệt, dải tóm tắt trả lời trước', () => {
    renderView();

    expect(screen.getByRole('heading', { level: 1, name: 'Vận hành chuyến' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Chờ chủ xe duyệt' })).toBeTruthy();
    expect(screen.getByText(/Chủ xe có 60 phút để trả lời/)).toBeTruthy();
    expect(screen.getByText('3 giao xe')).toBeTruthy();
    expect(screen.getByText('2 nhận xe')).toBeTruthy();

    const items = within(rail()).getAllByRole('button');
    expect(items.map((item) => item.textContent)).toEqual([
      'Chờ chủ xe duyệt4',
      'Chờ khách giữ chỗ2',
      'Sắp giao xe5',
      'Đang thuê12',
    ]);
    expect(within(rail()).getByRole('button', { name: /Chờ chủ xe duyệt/ }).getAttribute('aria-current')).toBe('true');
  });

  it('thẻ đếm: số khẩn thành gợi ý đỏ, thẻ đang chọn mang aria-pressed', () => {
    renderView();
    const cards = screen.getByRole('group', { name: 'Thẻ đếm việc' });

    const pending = within(cards).getByRole('button', { name: /Chờ chủ xe duyệt/ });
    expect(pending.getAttribute('aria-pressed')).toBe('true');
    expect(within(pending).getByText('1 sắp hết hạn')).toBeTruthy();
    expect(within(cards).getByText('2 quá giờ giao')).toBeTruthy();
    // Có việc nhưng không khẩn: câu bình yên, không phải con số đỏ.
    expect(within(cards).getByText('Chưa chuyến nào quá giờ trả')).toBeTruthy();
  });

  it('đổi hàng đợi ghi ?queue= (mặc định thì URL trần) và xoá tham số của hàng đợi cũ', () => {
    nav.params = new URLSearchParams('q=abc&page=3');
    renderView();

    fireEvent.click(within(rail()).getByRole('button', { name: /Sắp giao xe/ }));
    expect(lastUrl()).toBe('/admin/trips?queue=pickup_soon');

    fireEvent.click(within(rail()).getByRole('button', { name: /Chờ chủ xe duyệt/ }));
    expect(lastUrl()).toBe('/admin/trips');
  });

  it('thiếu quyền đơn thuê: không có hàng đợi nào, chỉ màn thiếu quyền', () => {
    perms.granted = new Set<string>();
    renderView();

    expect(screen.queryByRole('navigation', { name: 'Chọn hàng đợi' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Vận hành chuyến' })).toBeTruthy();
  });
});

describe('Vận hành chuyến — hàng đợi yêu cầu', () => {
  it('chờ duyệt: khách (SĐT che), xe · gian hàng kèm SĐT chủ xe gọi được, đồng hồ hạn trả lời', () => {
    renderView();

    expect(requests.lastFilters).toMatchObject({ queue: 'pending_approval' });
    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
    expect(screen.getByText('091****678')).toBeTruthy();
    expect(screen.getByText('Toyota Vios · 51A-123.45')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gọi chủ xe' }).getAttribute('href')).toBe(
      'tel:0988111222',
    );
    expect(screen.getByRole('columnheader', { name: 'Hạn trả lời' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/còn/);
    expect(screen.getByText('máy chưa nhắc')).toBeTruthy();
  });

  it('"Nhắc chủ xe" gửi đúng id; đã nhắc trong cooldown thì nút tắt kèm lý do', () => {
    Object.assign(
      requests,
      settled({
        items: [request(), request({ id: 'r2', customerName: 'Lê C', lastPlatformRemindAt: at(-2 * MINUTE) })],
        meta: { ...META, total: 2 },
      }),
    );
    renderView();

    // `getAllByLabelText` thay vì `getAllByRole(..., { name })`: hàng trong cooldown bọc nút
    // bằng Tooltip, kéo cả bộ style của nó vào jsdom, và phép role tính khả kiến + accessible
    // name qua `getComputedStyle` cho từng nút — ~6s ở máy dev, chạm `testTimeout` trên CI.
    // Nút có icon nên nhãn của nó là `aria-label`, tức vẫn là phép kiểm đúng tên cho trình đọc.
    const buttons = within(screen.getByRole('table')).getAllByLabelText('Nhắc chủ xe');
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]!);
    expect(remind.mutate.mock.calls[0]?.[0]).toEqual({ id: 'r1' });
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('chờ giữ chỗ: cột hạn giữ chỗ với số tiền, không có nút nhắc', () => {
    nav.params = new URLSearchParams('queue=awaiting_hold');
    Object.assign(
      requests,
      settled({
        items: [
          request({
            status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
            decidedAt: at(-5 * MINUTE),
            holdExpiresAt: at(100 * MINUTE),
            holdAmount: '500000',
          }),
        ],
        meta: META,
      }),
    );
    renderView();

    expect(requests.lastFilters).toMatchObject({ queue: 'awaiting_hold' });
    expect(screen.getByRole('columnheader', { name: 'Hạn giữ chỗ' })).toBeTruthy();
    expect(screen.getByText('Giữ chỗ 500.000 ₫')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nhắc chủ xe' })).toBeNull();
  });
});

describe('Vận hành chuyến — hàng đợi đơn', () => {
  it('sắp giao xe: quá giờ thành chip đỏ "quá 2 giờ"; mở chi tiết ghi ?open= và giữ hàng đợi', () => {
    nav.params = new URLSearchParams('queue=pickup_soon');
    renderView();

    expect(bookings.lastFilters).toMatchObject({ queue: 'pickup_soon' });
    expect(screen.getByText('quá 2 giờ')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết đơn DH-001' }));
    expect(lastUrl()).toBe('/admin/trips?queue=pickup_soon&open=b1');
  });

  it('đơn đang mở ở URL → panel nhận id; đang thuê thì chip nằm ở cột trả xe', () => {
    nav.params = new URLSearchParams('queue=active&open=b1');
    Object.assign(
      bookings,
      settled({
        items: [booking({ status: BOOKING_STATUS.ACTIVE, pickupAt: at(-24 * HOUR), returnAt: at(90 * MINUTE) })],
        meta: META,
      }),
    );
    renderView();

    expect(drawer.bookingId).toBe('b1');
    expect(screen.getByText('còn 1 giờ')).toBeTruthy();
  });
});
